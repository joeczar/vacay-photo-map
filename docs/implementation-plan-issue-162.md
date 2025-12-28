# Implementation Plan: Cleanup & Tests - Remove Public/Token Code, Integration Tests

**Issue:** #162
**Branch:** `feature/issue-162-cleanup-tests`
**Parent Issue:** #154 (RBAC Implementation)
**Complexity:** Medium
**Total Commits:** 6

## Overview

This cleanup task removes deprecated public trip and share link functionality that's been replaced by the new RBAC system. We'll delete unused token generation code, remove public/private toggle UI, eliminate backend token validation, and add comprehensive integration tests for the RBAC system.

The key insight: `is_public` is still used to distinguish draft vs published trips, but no longer controls access. Access is now controlled by the `trip_access` table with role-based permissions.

## Prerequisites

- [ ] RBAC system is fully implemented (#154)
- [ ] Invite system is functional
- [ ] All trip routes require authentication
- [ ] `trip_access` table is the source of truth for permissions

## Architecture

### What's Being Removed

**Frontend:**
- Share sheet UI component in TripView.vue
- Token generator utility and tests
- Token parameter in API calls
- Public route access (no auth guard)

**Backend:**
- `/api/trips/:id/protection` endpoint (token generation/validation)
- `access_token_hash` column from SELECT queries (keep in schema for now)

### What Stays

**Keep these:**
- `is_public` field - Used for draft (false) vs published (true) distinction
- Schema columns - May be used in future migrations, keep for safety
- Admin views that set `is_public` when publishing trips

### Data Flow After Cleanup

```
User Login → JWT Token → /trip/:slug (requireAuth) → Check trip_access table → Grant/Deny based on role
Admin always bypasses trip_access checks
```

## Atomic Commits

Each commit is independently reviewable and leaves the codebase in a working state.

---

### Commit 1: Backend - Remove protection endpoint

**Type:** refactor
**Scope:** api/routes
**Files:**
- `api/src/routes/trips.ts` - Delete endpoint

**Changes:**
- Remove `trips.patch("/:id/protection", ...)` endpoint (lines 740-811)
- This endpoint handled token generation and `is_public` updates for sharing
- No longer needed with RBAC - permissions managed via `trip_access` table

**Code to Remove:**
```typescript
// DELETE ENTIRE BLOCK: Lines 740-811
trips.patch("/:id/protection", requireAdmin, async (c) => {
  // ... token generation and validation logic
});
```

**Acceptance Criteria:**
- [ ] Endpoint deleted from routes/trips.ts
- [ ] No compilation errors
- [ ] Tests pass: `cd api && bun test`
- [ ] Type check passes: `cd api && bun run type-check`

---

### Commit 2: Frontend - Remove tokenGenerator utility

**Type:** refactor
**Scope:** app/utils
**Files:**
- `app/src/utils/tokenGenerator.ts` - Delete file
- `app/src/utils/tokenGenerator.test.ts` - Delete file

**Changes:**
- Delete entire tokenGenerator module (72 lines)
- Delete entire test file (107 lines)
- No imports to update - only used in TripView which we'll clean in next commit

**Acceptance Criteria:**
- [ ] Both files deleted
- [ ] No compilation errors
- [ ] Tests pass: `cd app && pnpm test`
- [ ] Type check passes: `cd app && pnpm type-check`

---

### Commit 3: Frontend - Remove share sheet UI from TripView

**Type:** refactor
**Scope:** app/views
**Files:**
- `app/src/views/TripView.vue` - Remove share functionality

**Changes:**

**1. Remove Share button (lines 9-21):**
```vue
<!-- DELETE THIS BLOCK -->
<Button
  @click="shareSheetOpen = true"
  v-ripple
>
  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <!-- ... -->
  </svg>
  Share
</Button>
```

**2. Remove Share Sheet component (lines 242-438):**
```vue
<!-- DELETE ENTIRE SHEET COMPONENT -->
<Sheet v-model:open="shareSheetOpen">
  <SheetContent>
    <!-- Public/Private toggle, token generation UI, etc -->
  </SheetContent>
</Sheet>

<!-- DELETE REGENERATE DIALOG TOO (lines 421-438) -->
<Dialog v-model:open="regenerateDialogOpen">
  <!-- ... -->
</Dialog>
```

**3. Remove share-related imports:**
```typescript
// In imports section, remove:
import { generateTripToken } from '@/utils/tokenGenerator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
```

**4. Remove state variables (lines 632-638, 790-797):**
```typescript
// DELETE THESE:
const shareSheetOpen = ref(false)
const localIsPublic = ref(false)
const shareLink = ref<string | null>(null)
const isUpdatingProtection = ref(false)
const protectionError = ref<string | null>(null)
const copySuccess = ref(false)
const isCopying = ref(false)
const regenerateDialogOpen = ref(false)
```

**5. Remove share methods (lines 996-1093):**
```typescript
// DELETE ALL THESE FUNCTIONS:
async function handlePublicToggle(checked: boolean) { ... }
async function generateShareLink() { ... }
async function confirmRegenerate() { ... }
async function copyShareLink() { ... }
async function shareViaNative() { ... }
```

**Acceptance Criteria:**
- [ ] No share button in UI
- [ ] No share sheet component
- [ ] No share-related state or methods
- [ ] Import statements cleaned up
- [ ] No compilation errors
- [ ] Tests pass: `cd app && pnpm test`
- [ ] Type check passes: `cd app && pnpm type-check`

---

### Commit 4: Frontend - Update database.ts and router

**Type:** refactor
**Scope:** app/lib, app/router
**Files:**
- `app/src/utils/database.ts` - Remove token parameter
- `app/src/router/index.ts` - Add auth guard

**Changes:**

**1. Update `getTripBySlug` signature (database.ts, line 176-190):**

```typescript
// BEFORE:
export async function getTripBySlug(
  slug: string,
  token?: string
): Promise<(ApiTrip & { photos: Photo[] }) | null> {
  try {
    const path = token ? `/api/trips/slug/${slug}?token=${token}` : `/api/trips/slug/${slug}`
    const trip = await api.get<ApiTripWithPhotosResponse>(path)
    return transformApiTripWithPhotos(trip)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

// AFTER:
export async function getTripBySlug(
  slug: string
): Promise<(ApiTrip & { photos: Photo[] }) | null> {
  try {
    const trip = await api.get<ApiTripWithPhotosResponse>(`/api/trips/slug/${slug}`)
    return transformApiTripWithPhotos(trip)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
```

**2. Add auth guard to /trip/:slug route (router/index.ts, line 93-97):**

```typescript
// BEFORE:
{
  path: '/trip/:slug',
  name: 'trip',
  component: () => import('../views/TripView.vue')
}

// AFTER:
{
  path: '/trip/:slug',
  name: 'trip',
  component: () => import('../views/TripView.vue'),
  meta: { requiresAuth: true }
}
```

**Acceptance Criteria:**
- [ ] `getTripBySlug` no longer accepts token parameter
- [ ] `/trip/:slug` route requires authentication
- [ ] No compilation errors
- [ ] Tests pass: `cd app && pnpm test`
- [ ] Type check passes: `cd app && pnpm type-check`
- [ ] Manual test: Accessing /trip/:slug redirects to /login when not authenticated

---

### Commit 5: Backend - Add comprehensive RBAC integration tests

**Type:** test
**Scope:** api/routes
**Files:**
- `api/src/routes/rbac-integration.test.ts` - Create new file

**Changes:**

Create comprehensive integration test file that validates the entire RBAC flow end-to-end.

**Test Structure:**

```typescript
// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { invites } from "./invites";
import { tripAccess } from "./trip-access";
import { trips } from "./trips";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import {
  getAdminAuthHeader,
  getUserAuthHeader,
  TEST_ADMIN_USER_ID,
  TEST_USER_ID,
} from "../test-helpers";

// Create test app with all RBAC routes
function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api/invites", invites);
  app.route("/api", tripAccess);
  app.route("/api/trips", trips);
  return app;
}

// Test data
let testTripId: string;
let inviteCode: string;
let editorUserId: string;
let viewerUserId: string;

describe("RBAC Integration Tests", () => {
  beforeAll(async () => {
    const db = getDbClient();
    const now = Date.now();

    // Create admin user
    const adminWebauthnId = `test-webauthn-admin-${now}`;
    const adminEmail = `test-admin-rbac-${now}@example.com`;
    await db`
      INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin, display_name)
      VALUES (${TEST_ADMIN_USER_ID}, ${adminEmail}, ${adminWebauthnId}, true, 'Admin User')
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            is_admin = EXCLUDED.is_admin,
            webauthn_user_id = EXCLUDED.webauthn_user_id
    `;

    // Create test trip (published)
    const tripResult = await db`
      INSERT INTO trips (title, slug, description, is_public)
      VALUES ('Test Trip', 'test-trip-rbac', 'Integration test trip', true)
      RETURNING id
    `;
    testTripId = tripResult[0].id;
  });

  afterAll(async () => {
    const db = getDbClient();
    // Cleanup in reverse dependency order
    await db`DELETE FROM trip_access WHERE trip_id = ${testTripId}`;
    await db`DELETE FROM photos WHERE trip_id = ${testTripId}`;
    await db`DELETE FROM trips WHERE id = ${testTripId}`;
    await db`DELETE FROM user_profiles WHERE id = ${TEST_ADMIN_USER_ID}`;
    if (editorUserId) await db`DELETE FROM user_profiles WHERE id = ${editorUserId}`;
    if (viewerUserId) await db`DELETE FROM user_profiles WHERE id = ${viewerUserId}`;
  });

  describe("Invite Creation and Validation", () => {
    it("should allow admin to create invite for trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.request("/api/invites", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "editor@example.com",
          role: "editor",
          tripIds: [testTripId],
          expiresInDays: 7,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.invite.code).toBeDefined();
      expect(data.tripIds).toContain(testTripId);
      inviteCode = data.invite.code;
    });

    it("should validate invite code", async () => {
      const app = createTestApp();

      const res = await app.request(`/api/invites/validate/${inviteCode}`, {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.invite.role).toBe("editor");
      expect(data.trips[0].id).toBe(testTripId);
    });

    it("should reject invalid invite code", async () => {
      const app = createTestApp();

      const res = await app.request("/api/invites/validate/invalid-code-xyz", {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.reason).toBe("not_found");
    });

    it("should reject expired invite", async () => {
      const app = createTestApp();
      const db = getDbClient();
      const authHeader = await getAdminAuthHeader();

      // Create expired invite
      const res = await app.request("/api/invites", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "viewer",
          tripIds: [testTripId],
          expiresInDays: -1, // Expired yesterday
        }),
      });

      const data = await res.json();
      const expiredCode = data.invite.code;

      // Validate expired invite
      const validateRes = await app.request(`/api/invites/validate/${expiredCode}`, {
        method: "GET",
      });

      expect(validateRes.status).toBe(200);
      const validateData = await validateRes.json();
      expect(validateData.valid).toBe(false);
      expect(validateData.reason).toBe("expired");
    });
  });

  describe("Registration with Invite", () => {
    it("should grant trip access when registering with valid invite", async () => {
      // This test would require implementing registration endpoint
      // For now, we simulate by directly creating user and using invite
      const db = getDbClient();
      const now = Date.now();

      // Create editor user
      const editorWebauthnId = `test-webauthn-editor-${now}`;
      const editorEmail = `test-editor-${now}@example.com`;
      const editorResult = await db`
        INSERT INTO user_profiles (email, webauthn_user_id, is_admin, display_name)
        VALUES (${editorEmail}, ${editorWebauthnId}, false, 'Editor User')
        RETURNING id
      `;
      editorUserId = editorResult[0].id;

      // Mark invite as used (simulating registration flow)
      await db`
        UPDATE invites
        SET used_at = NOW(), used_by_user_id = ${editorUserId}
        WHERE code = ${inviteCode}
      `;

      // Grant access based on invite (simulating registration flow)
      await db`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${editorUserId}, ${testTripId}, 'editor', ${TEST_ADMIN_USER_ID})
      `;

      // Verify access was granted
      const accessCheck = await db`
        SELECT role FROM trip_access
        WHERE user_id = ${editorUserId} AND trip_id = ${testTripId}
      `;

      expect(accessCheck.length).toBe(1);
      expect(accessCheck[0].role).toBe("editor");
    });

    it("should reject using invite twice", async () => {
      const app = createTestApp();

      const res = await app.request(`/api/invites/validate/${inviteCode}`, {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.reason).toBe("already_used");
    });
  });

  describe("Trip Access Control", () => {
    it("should allow editor to view trip", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(editorUserId, `test-editor-${Date.now()}@example.com`);

      const res = await app.request(`/api/trips/slug/test-trip-rbac`, {
        method: "GET",
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trip.id).toBe(testTripId);
      expect(data.trip.userRole).toBe("editor");
    });

    it("should deny access to user without permission", async () => {
      const app = createTestApp();
      const db = getDbClient();
      const now = Date.now();

      // Create viewer user without trip access
      const viewerWebauthnId = `test-webauthn-viewer-${now}`;
      const viewerEmail = `test-viewer-${now}@example.com`;
      const viewerResult = await db`
        INSERT INTO user_profiles (email, webauthn_user_id, is_admin, display_name)
        VALUES (${viewerEmail}, ${viewerWebauthnId}, false, 'Viewer User')
        RETURNING id
      `;
      viewerUserId = viewerResult[0].id;

      const authHeader = await getUserAuthHeader(viewerUserId, viewerEmail);

      const res = await app.request(`/api/trips/slug/test-trip-rbac`, {
        method: "GET",
        headers: authHeader,
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Forbidden");
    });

    it("should allow admin to bypass access checks", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.request(`/api/trips/slug/test-trip-rbac`, {
        method: "GET",
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trip.id).toBe(testTripId);
      // Admin should see admin role or undefined (bypass mode)
      expect(data.trip.userRole === "admin" || data.trip.userRole === undefined).toBe(true);
    });
  });

  describe("Role-Based Permissions", () => {
    it("should allow admin to grant trip access", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Grant viewer access to viewerUserId
      const res = await app.request(`/api/trips/${testTripId}/access`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: viewerUserId,
          role: "viewer",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.tripAccess.role).toBe("viewer");
    });

    it("should allow viewer to view trip after access granted", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(viewerUserId, `test-viewer-${Date.now()}@example.com`);

      const res = await app.request(`/api/trips/slug/test-trip-rbac`, {
        method: "GET",
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trip.userRole).toBe("viewer");
    });

    it("should allow admin to revoke trip access", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Revoke viewer access
      const res = await app.request(`/api/trips/${testTripId}/access/${viewerUserId}`, {
        method: "DELETE",
        headers: authHeader,
      });

      expect(res.status).toBe(204);
    });

    it("should deny access after revocation", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(viewerUserId, `test-viewer-${Date.now()}@example.com`);

      const res = await app.request(`/api/trips/slug/test-trip-rbac`, {
        method: "GET",
        headers: authHeader,
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Draft vs Published Trips", () => {
    it("should handle draft trips (is_public=false)", async () => {
      const app = createTestApp();
      const db = getDbClient();
      const authHeader = await getAdminAuthHeader();

      // Create draft trip
      const draftResult = await db`
        INSERT INTO trips (title, slug, description, is_public)
        VALUES ('Draft Trip', 'draft-trip-test', 'Draft test', false)
        RETURNING id
      `;
      const draftTripId = draftResult[0].id;

      // Admin can access draft trip
      const res = await app.request(`/api/trips/slug/draft-trip-test`, {
        method: "GET",
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trip.isPublic).toBe(false);

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${draftTripId}`;
    });
  });
});
```

**Test Coverage:**
1. Invite creation by admin
2. Invite validation (valid, invalid, expired)
3. Registration with invite (simulated)
4. Using invite twice (rejection)
5. Editor viewing trip with access
6. User without access denied
7. Admin bypass verification
8. Granting access
9. Revoking access
10. Draft vs published trips

**Acceptance Criteria:**
- [ ] All tests pass: `cd api && bun test rbac-integration.test.ts`
- [ ] Tests cover full RBAC flow end-to-end
- [ ] Tests verify admin bypass
- [ ] Tests verify role-based permissions
- [ ] Tests verify invite lifecycle
- [ ] No hardcoded environment variables (use test-helpers)

---

### Commit 6: Documentation and final verification

**Type:** docs
**Scope:** project
**Files:**
- `docs/implementation-plan-issue-162.md` - Delete after PR merged
- Update any relevant docs if needed

**Changes:**
- Manual browser verification of all flows
- Final cleanup pass
- Update CLAUDE.md or PROJECT_ROADMAP.md if needed

**Verification Steps:**

**Backend:**
```bash
cd api
bun test                    # All tests pass
bun run type-check          # No type errors
```

**Frontend:**
```bash
cd app
pnpm test                   # All tests pass
pnpm type-check             # No type errors
pnpm lint                   # No lint errors
```

**Manual Testing:**
1. Start dev server: `pnpm dev:docker`
2. Create admin account (first user)
3. Create and publish a trip
4. Verify no "Share" button in trip view
5. Create invite for trip
6. Register second user with invite
7. Verify second user can access trip
8. Verify unauthenticated user redirected to /login for /trip/:slug
9. Test admin access to any trip
10. Test revoking access

**Acceptance Criteria:**
- [ ] All automated tests pass
- [ ] All type checks pass
- [ ] All lint checks pass
- [ ] Manual browser verification complete
- [ ] No console errors
- [ ] Share UI completely removed
- [ ] All routes require authentication
- [ ] RBAC system working end-to-end

---

## Testing Strategy

Tests are included in Commit 5 as a comprehensive integration test suite. This follows TDD principles by validating the full RBAC flow after cleanup.

**Test Types:**
- Integration tests: Full RBAC flow (invite → registration → access control)
- Manual testing: Browser verification of UI changes

**Test Files:**
- `api/src/routes/rbac-integration.test.ts` - New comprehensive integration tests
- Existing test files should continue passing after cleanup

## Verification Checklist

Before PR creation:
- [ ] All 6 commits completed and reviewed
- [ ] Backend tests pass: `cd api && bun test`
- [ ] Frontend tests pass: `cd app && pnpm test`
- [ ] Type check passes: `pnpm type-check` (root)
- [ ] Lint passes: `cd app && pnpm lint`
- [ ] Manual verification in browser
- [ ] No share functionality visible in UI
- [ ] All trip routes require authentication
- [ ] RBAC permissions working correctly

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing trips | Keep `is_public` and schema columns; only remove UI/endpoints |
| Removing needed code | Thorough search for all references before deletion |
| Missing test coverage | Comprehensive integration tests cover full flow |
| Frontend/backend mismatch | Coordinate changes across both in atomic commits |

## Open Questions

**None** - Scope is clear from parent issue #154 and research findings.

## Notes

### Why Keep is_public?

The `is_public` field serves a different purpose now:
- **Old meaning:** Public (anyone) vs Private (token required)
- **New meaning:** Published (visible in lists) vs Draft (hidden)
- Used by AdminView and TripManagementView to distinguish draft/published state
- Not related to access control (handled by `trip_access` table)

### Schema Migration Strategy

We're NOT dropping `is_public` or `access_token_hash` columns in this cleanup because:
1. May be useful for future features
2. Easier to keep than to add back later
3. Only removing code that actively uses them incorrectly
4. Future migration can drop if truly unused

### Frontend Auth Flow

After this cleanup:
```
User → /trip/:slug → Router checks meta.requiresAuth →
  If not authenticated: Redirect to /login
  If authenticated: Load TripView → Call getTripBySlug(slug) →
    Backend checks trip_access → Grant or 403
```

No more public access or token-based access. All access is authenticated and role-based.

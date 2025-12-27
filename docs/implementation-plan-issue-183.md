# Implementation Plan: Aggressive Test Cleanup

**Issue:** #183
**Branch:** `feature/issue-183-aggressive-test-cleanup`
**Complexity:** Medium
**Total Commits:** 8

## Overview

Remove ~75 redundant tests (40% reduction from 189 to ~115 tests) while maintaining coverage of actual application logic. The cleanup focuses on eliminating duplicate auth checks, UUID validation tests, and framework behavior tests that don't test our code.

## Prerequisites

- [ ] All existing tests pass: `bun test`
- [ ] Type checking passes: `pnpm type-check`

## Architecture

### Current Test Structure (189 tests)
- `routes/auth.test.ts` - 21 tests (many duplicate middleware tests)
- `routes/trips.test.ts` - 44 tests (auth + UUID duplicates)
- `routes/trip-access.test.ts` - 34 tests (auth + UUID duplicates)
- `routes/invites.test.ts` - 21 tests (auth + UUID + rate limit duplicates)
- `routes/upload.test.ts` - 15 tests (auth duplicates)
- `middleware/auth.test.ts` - 20 tests (canonical auth tests)
- `middleware/fileValidation.test.ts` - 25 tests
- `routes/health.test.ts` - 4 tests
- `db/__tests__/client.test.ts` - 5 tests

### Target Test Structure (~115 tests)
- Consolidated auth validation in middleware tests
- Parameterized UUID validation tests
- Removed framework behavior tests
- Single rate limiting test suite
- Business logic tests remain intact

### Test Categories to Remove

1. **Duplicate 401/403 Auth Tests (~25 tests)** - Already tested in `middleware/auth.test.ts`
2. **Repetitive UUID Validation (~17 tests)** - Consolidate into parameterized test
3. **Duplicate Rate Limiting (2 tests)** - Keep in middleware, remove from routes
4. **Framework Behavior Tests (~5 tests)** - Testing Hono, not our code
5. **Middleware Duplicates (~15 tests)** - Remove from `routes/auth.test.ts`
6. **setTimeout Mock (1 test optimization)** - Make retry test faster

## Atomic Commits

### Commit 1: Create shared auth validation test helper
**Type:** test
**Scope:** middleware
**Files:**
- `api/src/middleware/auth.test.ts` - Modify

**Changes:**
- Add `describe("Protected endpoints auth enforcement")` block
- Create parameterized test that checks all protected endpoints return 401/403
- List all protected endpoints from routes: `/api/trips`, `/api/invites`, `/api/trip-access`, etc.
- Test both missing auth (401) and non-admin (403 where applicable)

**Acceptance Criteria:**
- [ ] New test block covers all protected routes
- [ ] Tests pass: `bun test api/src/middleware/auth.test.ts`
- [ ] Verifies 401 for missing auth, 403 for insufficient permissions

---

### Commit 2: Remove duplicate 401/403 tests from route files
**Type:** test
**Scope:** routes
**Files:**
- `api/src/routes/auth.test.ts` - Modify (remove lines 183-195, 228-237, 254-263)
- `api/src/routes/upload.test.ts` - Modify (remove lines 99-131)
- `api/src/routes/trips.test.ts` - Modify (remove ~14 auth tests)
- `api/src/routes/trip-access.test.ts` - Modify (remove ~10 auth tests)
- `api/src/routes/invites.test.ts` - Modify (remove ~6 auth tests)

**Changes:**
- Remove `returns 401 without authentication` tests (covered by middleware tests)
- Remove `returns 403 for non-admin users` tests (covered by middleware tests)
- Keep ONLY business logic tests (invite validation, trip access RBAC, file signatures, etc.)

**Specific removals:**
- `routes/auth.test.ts`:
  - Line 183-195: `POST /api/auth/passkeys/options - returns 401 without auth token`
  - Line 228-237: `GET /api/auth/passkeys - returns 401 without auth token`
  - Line 254-263: `GET /api/auth/me - returns 401 without token`
- `routes/upload.test.ts`:
  - Line 99-112: `returns 401 without authentication`
  - Line 114-131: `returns 403 for non-admin users`
- `routes/trips.test.ts`:
  - Line 78-88: `GET /api/trips - returns 401 without authentication`
  - Line 174-184: `GET /api/trips/:slug - returns 401 without authentication`
  - Line 333-346: `POST /api/trips - returns 401 without authentication`
  - Line 348-364: `POST /api/trips - returns 403 for non-admin users`
  - Line 445-455: `PATCH /api/trips/:id - returns 401 without authentication`
  - Line 457-468: `PATCH /api/trips/:id - returns 403 for non-admin users`
  - Line 539-547: `DELETE /api/trips/:id - returns 401 without authentication`
  - Line 549-558: `DELETE /api/trips/:id - returns 403 for non-admin users`
  - Line 594-604: `PATCH /api/trips/:id/protection - returns 401 without authentication`
  - Line 606-617: `PATCH /api/trips/:id/protection - returns 403 for non-admin users`
  - Line 744-754: `GET /api/trips/admin - returns 401 for unauthenticated request`
  - Line 1015-1026: `DELETE /api/trips/photos/:id - returns 401 without authentication`
  - Line 1028-1043: `DELETE /api/trips/photos/:id - returns 403 for non-admin user`
- `routes/trip-access.test.ts`:
  - Line 170-184: `POST /api/trip-access - returns 401 if not authenticated`
  - Line 186-204: `POST /api/trip-access - returns 403 if not admin`
  - Line 453-461: `GET /api/trips/:tripId/access - returns 401 if not authenticated`
  - Line 463-473: `GET /api/trips/:tripId/access - returns 403 if not admin`
  - Line 564-575: `PATCH /api/trip-access/:id - returns 401 if not authenticated`
  - Line 577-592: `PATCH /api/trip-access/:id - returns 403 if not admin`
  - Line 701-710: `DELETE /api/trip-access/:id - returns 401 if not authenticated`
  - Line 712-723: `DELETE /api/trip-access/:id - returns 403 if not admin`
  - Line 780-788: `GET /api/users - returns 401 if not authenticated`
  - Line 790-800: `GET /api/users - returns 403 if not admin`
- `routes/invites.test.ts`:
  - Line 116-130: `POST /api/invites - returns 401 without authentication`
  - Line 132-147: `POST /api/invites - returns 403 for non-admin users`
  - Line 281-289: `GET /api/invites - returns 401 without authentication`
  - Line 291-301: `GET /api/invites - returns 403 for non-admin users`
  - Line 322-331: `DELETE /api/invites/:id - returns 401 without authentication`

**Acceptance Criteria:**
- [ ] All auth tests removed from route files
- [ ] Business logic tests remain untouched
- [ ] Tests pass: `bun test`
- [ ] ~25 fewer tests

---

### Commit 3: Create parameterized UUID validation tests
**Type:** test
**Scope:** validation
**Files:**
- `api/src/middleware/validation.test.ts` - Create

**Changes:**
- Create new test file for shared validation concerns
- Add parameterized UUID validation test:
```typescript
const uuidEndpoints = [
  { method: "PATCH", path: "/api/trips/invalid-id", desc: "Update trip" },
  { method: "DELETE", path: "/api/trips/invalid-id", desc: "Delete trip" },
  { method: "GET", path: "/api/trips/id/invalid-id", desc: "Get trip by UUID" },
  { method: "PATCH", path: "/api/trips/invalid-id/protection", desc: "Update protection" },
  { method: "DELETE", path: "/api/trips/photos/invalid-id", desc: "Delete photo" },
  { method: "POST", path: "/api/trip-access", body: { userId: "invalid", tripId: "valid-uuid", role: "viewer" }, desc: "Grant access - invalid user" },
  { method: "POST", path: "/api/trip-access", body: { userId: "valid-uuid", tripId: "invalid", role: "viewer" }, desc: "Grant access - invalid trip" },
  { method: "GET", path: "/api/trips/invalid-id/access", desc: "List trip access" },
  { method: "PATCH", path: "/api/trip-access/invalid-id", body: { role: "editor" }, desc: "Update trip access" },
  { method: "DELETE", path: "/api/trip-access/invalid-id", desc: "Delete trip access" },
  { method: "DELETE", path: "/api/invites/invalid-id", desc: "Delete invite" },
];

describe("UUID validation", () => {
  uuidEndpoints.forEach(({ method, path, body, desc }) => {
    it(`${method} ${path} (${desc}) returns 400 for invalid UUID`, async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.request(path, {
        method,
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message.toLowerCase()).toMatch(/invalid.*format/);
    });
  });
});
```

**Acceptance Criteria:**
- [ ] New test file created
- [ ] Parameterized tests cover all UUID endpoints
- [ ] Tests pass: `bun test api/src/middleware/validation.test.ts`

---

### Commit 4: Remove individual UUID tests from route files
**Type:** test
**Scope:** routes
**Files:**
- `api/src/routes/trips.test.ts` - Modify
- `api/src/routes/trip-access.test.ts` - Modify
- `api/src/routes/invites.test.ts` - Modify

**Changes:**
- Remove all `returns 400 for invalid UUID format` tests from route files
- These are now covered by parameterized test in `validation.test.ts`

**Specific removals:**
- `routes/trips.test.ts`:
  - Line 470-483: `PATCH /api/trips/:id - returns 400 for invalid UUID format`
  - Line 561-573: `DELETE /api/trips/:id - returns 400 for invalid UUID format`
  - Line 619-632: `PATCH /api/trips/:id/protection - returns 400 for invalid UUID format`
  - Line 926-940: `GET /api/trips/:id (UUID) - returns 400 for invalid UUID format`
  - Line 1062-1076: `DELETE /api/trips/photos/:id - returns 400 for invalid UUID format`
- `routes/trip-access.test.ts`:
  - Line 227-247: `POST /api/trip-access - returns 400 for invalid user ID format`
  - Line 249-269: `POST /api/trip-access - returns 400 for invalid trip ID format`
  - Line 475-487: `GET /api/trips/:tripId/access - returns 400 for invalid trip ID format`
  - Line 594-610: `PATCH /api/trip-access/:id - returns 400 for invalid ID format`
  - Line 725-737: `DELETE /api/trip-access/:id - returns 400 for invalid ID format`
- `routes/invites.test.ts`:
  - Line 333-343: `DELETE /api/invites/:id - returns 400 for invalid UUID`

**Acceptance Criteria:**
- [ ] All individual UUID validation tests removed
- [ ] Tests pass: `bun test`
- [ ] ~17 fewer tests

---

### Commit 5: Remove duplicate rate limiting tests
**Type:** test
**Scope:** routes
**Files:**
- `api/src/routes/invites.test.ts` - Modify

**Changes:**
- Remove `enforces rate limiting` test from `routes/invites.test.ts` (line 551-571)
- Rate limiting is already comprehensively tested in `middleware/auth.test.ts`
- The auth middleware applies to all routes, so one suite is sufficient

**Acceptance Criteria:**
- [ ] Rate limiting test removed from invites
- [ ] Rate limiting tests remain in `middleware/auth.test.ts`
- [ ] Tests pass: `bun test`
- [ ] 1 fewer test

---

### Commit 6: Remove framework behavior tests
**Type:** test
**Scope:** routes
**Files:**
- `api/src/routes/health.test.ts` - Modify

**Changes:**
- Remove `GET /nonexistent returns 404` test (if present)
- This tests Hono's 404 handling, not our application logic
- Our code doesn't implement 404 behavior - that's the framework

**Note:** After reviewing the test files, framework behavior tests appear minimal. If no clear candidates exist, skip this commit and adjust total commits to 7.

**Acceptance Criteria:**
- [ ] Framework behavior tests identified and removed
- [ ] Tests pass: `bun test`
- [ ] ~1-5 fewer tests

---

### Commit 7: Remove middleware duplicates from routes/auth.test.ts
**Type:** test
**Scope:** routes
**Files:**
- `api/src/routes/auth.test.ts` - Modify

**Changes:**
- The `POST /api/auth/passkeys/verify - returns 401 without auth token` test (line 199-209) duplicates `middleware/auth.test.ts`
- The `DELETE /api/auth/passkeys/:id - returns 401 without auth token` test (line 240-252) duplicates middleware tests
- Remove these as they're testing the middleware, not the route logic
- Keep business logic tests like:
  - Email validation
  - Challenge validation
  - Credential validation
  - Invite code validation
  - Rate limiting (auth-specific, different from generic middleware rate limiting)

**Acceptance Criteria:**
- [ ] Duplicate middleware tests removed
- [ ] Business logic tests remain
- [ ] Tests pass: `bun test api/src/routes/auth.test.ts`
- [ ] ~10-15 fewer tests

---

### Commit 8: Mock setTimeout in client.test.ts for faster tests
**Type:** test
**Scope:** db
**Files:**
- `api/src/db/__tests__/client.test.ts` - Modify

**Changes:**
- Already implemented! The test file shows setTimeout is mocked in line 106-139
- Verify this optimization is working correctly
- No changes needed if current implementation is optimal
- If not mocked, add:
```typescript
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) => {
  fn(); // Execute immediately
  return 1 as unknown as ReturnType<typeof setTimeout>;
}) as typeof setTimeout;
```

**Acceptance Criteria:**
- [ ] Retry test completes in <100ms instead of waiting for actual delays
- [ ] Tests pass: `bun test api/src/db/__tests__/client.test.ts`
- [ ] Test suite runs faster

---

## Testing Strategy

Tests are being removed, not added. Verification strategy:

1. **After each commit:** Run `bun test` to ensure remaining tests pass
2. **After commit 2:** Verify auth is still tested via middleware suite
3. **After commit 4:** Verify UUID validation is covered by parameterized tests
4. **Final verification:**
   - Run full test suite: `bun test`
   - Check coverage hasn't dropped for application logic
   - Verify ~75 tests removed (189 → ~115)

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `bun test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Test count reduced by ~40% (189 → ~115 tests)
- [ ] Business logic tests remain intact (invites, RBAC, file validation)
- [ ] No duplicate auth/UUID/rate-limit tests across files

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Removing too many tests, losing coverage | Keep ALL business logic tests. Only remove duplicates of middleware/framework behavior |
| Breaking existing test suite | Run `bun test` after each commit |
| Missing edge cases in parameterized tests | Comprehensive endpoint list in parameterized test covers all UUID routes |

## Open Questions

None - requirements are clear from the issue description.

## Test Reduction Breakdown

| File | Before | After | Removed | Notes |
|------|--------|-------|---------|-------|
| `routes/auth.test.ts` | 21 | ~8 | ~13 | Remove middleware duplicates |
| `routes/trips.test.ts` | 44 | ~30 | ~14 | Remove auth + UUID tests |
| `routes/trip-access.test.ts` | 34 | ~24 | ~10 | Remove auth + UUID tests |
| `routes/invites.test.ts` | 21 | ~15 | ~6 | Remove auth + UUID + rate limit |
| `routes/upload.test.ts` | 15 | ~13 | ~2 | Remove auth tests |
| `middleware/auth.test.ts` | 20 | ~22 | -2 | Add comprehensive auth validation |
| `middleware/validation.test.ts` | 0 | ~17 | -17 | New parameterized UUID tests |
| Other files | 34 | 34 | 0 | No changes |
| **Total** | **189** | **~115** | **~74** | **~39% reduction** |

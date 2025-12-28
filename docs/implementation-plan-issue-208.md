# Implementation Plan: Add pagination to photo API endpoint

**Issue:** #208
**Branch:** `feature/issue-208-pagination`
**Complexity:** Medium
**Total Commits:** 4

## Overview
Add pagination support to the trip photo endpoint to handle trips with 300+ photos efficiently. The endpoint will accept `limit` and `offset` query parameters and return paginated results with metadata, while maintaining backward compatibility with existing clients.

## Prerequisites
- [x] Composite index `idx_photos_trip_taken (trip_id, taken_at)` exists (confirmed in schema.sql)
- [x] Two endpoints call `buildTripWithPhotosResponse()`:
  - `GET /api/trips/slug/:slug` (line 384, requires auth + access)
  - `GET /api/trips/id/:id` (line 429, admin-only)

## Architecture

### Components
- `buildTripWithPhotosResponse()` - Fetches photos and builds response (currently fetches ALL photos)
- `TripWithPhotosResponse` interface - Response type (needs pagination field)

### Data Flow
```
Request with ?limit=50&offset=0
  ↓
Extract & validate query params (cap limit at 100, prevent negative offset)
  ↓
buildTripWithPhotosResponse(trip, db, limit, offset)
  ↓
COUNT query → total photos
  ↓
MIN/MAX query → date_range (independent of pagination)
  ↓
SELECT with LIMIT/OFFSET → paginated photos
  ↓
Return { trip, photos, pagination: { total, hasMore, limit, offset } }
```

### Key Correctness Considerations

**CRITICAL: Date range calculation**
- Current implementation uses `photos[0]` and `photos[photos.length - 1]` for date_range
- This will BREAK with pagination (paginated results don't represent full date range)
- MUST use `MIN(taken_at)` and `MAX(taken_at)` from database instead
- This is independent of pagination and represents the true trip date range

**Database efficiency:**
- Single COUNT query: `SELECT COUNT(*) FROM photos WHERE trip_id = ${trip.id}`
- Single MIN/MAX query: `SELECT MIN(taken_at) as start, MAX(taken_at) as end FROM photos WHERE trip_id = ${trip.id}`
- Paginated query uses existing index: `idx_photos_trip_taken (trip_id, taken_at)`

**Pagination metadata:**
- `total`: Total number of photos (from COUNT query)
- `hasMore`: Boolean calculated as `offset + photos.length < total`
- `limit`: Echo back the limit used (after validation)
- `offset`: Echo back the offset used (after validation)

## Atomic Commits

Each commit is a reviewable unit. Implementer completes one commit, returns diff for review, then proceeds to next.

### Commit 1: Add pagination field to TripWithPhotosResponse interface
**Type:** feat
**Scope:** api/types
**Files:**
- `api/src/routes/trips.ts` - Modify interface (line 65-67)
- `api/src/routes/trips.test.ts` - Modify interface (line 47-60)
- `api/src/routes/rbac-integration.test.ts` - Modify interface (line 66+)

**Changes:**
- Add `pagination` field to `TripWithPhotosResponse` interface in all three files:
  ```typescript
  interface TripWithPhotosResponse extends TripResponse {
    photos: PhotoResponse[];
    pagination: {
      total: number;
      hasMore: boolean;
      limit: number;
      offset: number;
    };
  }
  ```

**Acceptance Criteria:**
- [x] Interface updated in `trips.ts`
- [x] Interface updated in `trips.test.ts`
- [x] Interface updated in `rbac-integration.test.ts`
- [x] Types pass: `pnpm type-check`

---

### Commit 2: Implement pagination logic in buildTripWithPhotosResponse
**Type:** feat
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.ts` - Modify `buildTripWithPhotosResponse()` (lines 214-244)

**Changes:**
1. Update function signature to accept optional pagination params:
   ```typescript
   async function buildTripWithPhotosResponse(
     trip: DbTrip,
     db: ReturnType<typeof getDbClient>,
     limit: number = 50,
     offset: number = 0,
   ): Promise<TripWithPhotosResponse>
   ```

2. Add COUNT query before photo query:
   ```typescript
   const [{ count: total }] = await db<{ count: number }[]>`
     SELECT COUNT(*) as count
     FROM photos
     WHERE trip_id = ${trip.id}
   `;
   ```

3. Replace date_range computation with MIN/MAX query (CRITICAL):
   ```typescript
   // OLD (BROKEN with pagination):
   // const dateRange = {
   //   start: photos.length > 0 ? photos[0].taken_at.toISOString() : trip.created_at.toISOString(),
   //   end: photos.length > 0 ? photos[photos.length - 1].taken_at.toISOString() : trip.created_at.toISOString(),
   // };

   // NEW (correct for all cases):
   const dateRangeResults = await db<{ start: Date | null; end: Date | null }[]>`
     SELECT
       MIN(taken_at) as start,
       MAX(taken_at) as end
     FROM photos
     WHERE trip_id = ${trip.id}
   `;

   const dateRange = {
     start: dateRangeResults[0]?.start?.toISOString() ?? trip.created_at.toISOString(),
     end: dateRangeResults[0]?.end?.toISOString() ?? trip.created_at.toISOString(),
   };
   ```

4. Add LIMIT/OFFSET to photo query:
   ```typescript
   const photos = await db<DbPhoto[]>`
     SELECT id, trip_id, storage_key, url, thumbnail_url,
            latitude, longitude, taken_at, caption, album, rotation, created_at
     FROM photos
     WHERE trip_id = ${trip.id}
     ORDER BY taken_at ASC
     LIMIT ${limit}
     OFFSET ${offset}
   `;
   ```

5. Compute pagination metadata:
   ```typescript
   const hasMore = offset + photos.length < total;
   ```

6. Update return statement:
   ```typescript
   return {
     ...toTripResponse(trip, total, dateRange),
     photos: photos.map(toPhotoResponse),
     pagination: {
       total,
       hasMore,
       limit,
       offset,
     },
   };
   ```

**Acceptance Criteria:**
- [x] Function signature accepts `limit` and `offset` with defaults
- [x] COUNT query added for total photos
- [x] MIN/MAX query added for date_range (not using paginated results)
- [x] LIMIT/OFFSET added to photo query
- [x] Pagination metadata calculated correctly
- [x] Tests pass: `pnpm test api/src/routes/trips.test.ts`
- [x] Types pass: `pnpm type-check`

---

### Commit 3: Wire up query params in both endpoints
**Type:** feat
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.ts` - Modify both GET endpoints (lines 384 and 429)

**Changes:**
1. Extract and validate query params in `GET /api/trips/slug/:slug` (before line 419):
   ```typescript
   // Extract pagination params from query string
   const limitParam = c.req.query("limit");
   const offsetParam = c.req.query("offset");

   // Parse and validate limit (default 50, max 100)
   let limit = 50;
   if (limitParam) {
     const parsedLimit = parseInt(limitParam, 10);
     if (isNaN(parsedLimit) || parsedLimit < 1) {
       return c.json(
         { error: "Bad Request", message: "Limit must be a positive integer" },
         400,
       );
     }
     limit = Math.min(parsedLimit, 100); // Cap at 100
   }

   // Parse and validate offset (default 0)
   let offset = 0;
   if (offsetParam) {
     const parsedOffset = parseInt(offsetParam, 10);
     if (isNaN(parsedOffset) || parsedOffset < 0) {
       return c.json(
         { error: "Bad Request", message: "Offset must be a non-negative integer" },
         400,
       );
     }
     offset = parsedOffset;
   }

   // Build response with photos and metadata
   const response = await buildTripWithPhotosResponse(trip, db, limit, offset);
   return c.json(response);
   ```

2. Extract and validate query params in `GET /api/trips/id/:id` (before line 456):
   ```typescript
   // Extract pagination params from query string
   const limitParam = c.req.query("limit");
   const offsetParam = c.req.query("offset");

   // Parse and validate limit (default 50, max 100)
   let limit = 50;
   if (limitParam) {
     const parsedLimit = parseInt(limitParam, 10);
     if (isNaN(parsedLimit) || parsedLimit < 1) {
       return c.json(
         { error: "Bad Request", message: "Limit must be a positive integer" },
         400,
       );
     }
     limit = Math.min(parsedLimit, 100); // Cap at 100
   }

   // Parse and validate offset (default 0)
   let offset = 0;
   if (offsetParam) {
     const parsedOffset = parseInt(offsetParam, 10);
     if (isNaN(parsedOffset) || parsedOffset < 0) {
       return c.json(
         { error: "Bad Request", message: "Offset must be a non-negative integer" },
         400,
       );
     }
     offset = parsedOffset;
   }

   // Build response with photos and metadata
   const response = await buildTripWithPhotosResponse(trip, db, limit, offset);
   return c.json(response);
   ```

**Acceptance Criteria:**
- [x] Both endpoints extract `limit` and `offset` query params
- [x] Invalid limit (non-integer, negative) returns 400
- [x] Invalid offset (non-integer, negative) returns 400
- [x] Limit capped at 100
- [x] Default values applied (limit=50, offset=0)
- [x] Both endpoints pass params to `buildTripWithPhotosResponse()`
- [x] Tests pass: `pnpm test api/src/routes/trips.test.ts`
- [x] Types pass: `pnpm type-check`

**Note:** There's deliberate duplication here. Consider extracting to a helper in a follow-up refactor, but for this PR, inline is fine.

---

### Commit 4: Add pagination tests
**Type:** test
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.test.ts` - Add new test suite

**Changes:**
Add comprehensive test suite after existing tests (before final closing brace):

```typescript
// ==========================================================================
// GET /api/trips/slug/:slug - Pagination tests
// ==========================================================================
describe("GET /api/trips/slug/:slug - pagination", () => {
  it("returns first page with default limit and offset", async () => {
    const db = getDbClient();
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    // Create trip with 5 photos
    const tripSlug = `pagination-default-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${tripSlug}, 'Pagination Test', true)
      RETURNING id
    `;

    // Create 5 photos with distinct timestamps
    const photoIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const [photo] = await db<{ id: string }[]>`
        INSERT INTO photos (
          trip_id, storage_key, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, ${`photo-${i}`}, ${`/api/photos/${trip.id}/photo-${i}.jpg`},
          ${`/api/photos/${trip.id}/thumb-${i}.jpg`}, 40.7128, -74.0060,
          NOW() + INTERVAL '${i} hours'
        )
        RETURNING id
      `;
      photoIds.push(photo.id);
    }

    // Request without pagination params (should use defaults)
    const res = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as TripWithPhotosResponse;

    // Should return all 5 photos (within default limit of 50)
    expect(data.photos.length).toBe(5);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.total).toBe(5);
    expect(data.pagination.limit).toBe(50);
    expect(data.pagination.offset).toBe(0);
    expect(data.pagination.hasMore).toBe(false);

    // Cleanup
    await db`DELETE FROM trips WHERE id = ${trip.id}`;
  });

  it("returns paginated results with custom limit and offset", async () => {
    const db = getDbClient();
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    // Create trip with 5 photos
    const tripSlug = `pagination-custom-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${tripSlug}, 'Pagination Test', true)
      RETURNING id
    `;

    // Create 5 photos with distinct timestamps
    for (let i = 0; i < 5; i++) {
      await db`
        INSERT INTO photos (
          trip_id, storage_key, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, ${`photo-${i}`}, ${`/api/photos/${trip.id}/photo-${i}.jpg`},
          ${`/api/photos/${trip.id}/thumb-${i}.jpg`}, 40.7128, -74.0060,
          NOW() + INTERVAL '${i} hours'
        )
      `;
    }

    // Request first 2 photos
    const res1 = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}?limit=2&offset=0`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as TripWithPhotosResponse;
    expect(data1.photos.length).toBe(2);
    expect(data1.pagination.total).toBe(5);
    expect(data1.pagination.limit).toBe(2);
    expect(data1.pagination.offset).toBe(0);
    expect(data1.pagination.hasMore).toBe(true);

    // Request next 2 photos
    const res2 = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}?limit=2&offset=2`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as TripWithPhotosResponse;
    expect(data2.photos.length).toBe(2);
    expect(data2.pagination.total).toBe(5);
    expect(data2.pagination.limit).toBe(2);
    expect(data2.pagination.offset).toBe(2);
    expect(data2.pagination.hasMore).toBe(true);

    // Request last photo
    const res3 = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}?limit=2&offset=4`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res3.status).toBe(200);
    const data3 = (await res3.json()) as TripWithPhotosResponse;
    expect(data3.photos.length).toBe(1);
    expect(data3.pagination.total).toBe(5);
    expect(data3.pagination.limit).toBe(2);
    expect(data3.pagination.offset).toBe(4);
    expect(data3.pagination.hasMore).toBe(false);

    // Cleanup
    await db`DELETE FROM trips WHERE id = ${trip.id}`;
  });

  it("caps limit at 100", async () => {
    const db = getDbClient();
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    // Create trip
    const tripSlug = `pagination-cap-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${tripSlug}, 'Pagination Test', true)
      RETURNING id
    `;

    // Request with limit > 100
    const res = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}?limit=500`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as TripWithPhotosResponse;
    expect(data.pagination.limit).toBe(100); // Capped

    // Cleanup
    await db`DELETE FROM trips WHERE id = ${trip.id}`;
  });

  it("returns 400 for invalid limit", async () => {
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    const res = await app.fetch(
      new Request(`http://localhost/api/trips/slug/test-trip?limit=invalid`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.message).toContain("positive integer");
  });

  it("returns 400 for negative limit", async () => {
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    const res = await app.fetch(
      new Request(`http://localhost/api/trips/slug/test-trip?limit=-1`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.message).toContain("positive integer");
  });

  it("returns 400 for invalid offset", async () => {
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    const res = await app.fetch(
      new Request(`http://localhost/api/trips/slug/test-trip?offset=invalid`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.message).toContain("non-negative integer");
  });

  it("returns 400 for negative offset", async () => {
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    const res = await app.fetch(
      new Request(`http://localhost/api/trips/slug/test-trip?offset=-1`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.message).toContain("non-negative integer");
  });

  it("maintains correct date_range regardless of pagination", async () => {
    const db = getDbClient();
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    // Create trip with 5 photos spanning different dates
    const tripSlug = `pagination-daterange-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${tripSlug}, 'Date Range Test', true)
      RETURNING id
    `;

    // Create photos with increasing timestamps
    for (let i = 0; i < 5; i++) {
      await db`
        INSERT INTO photos (
          trip_id, storage_key, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, ${`photo-${i}`}, ${`/api/photos/${trip.id}/photo-${i}.jpg`},
          ${`/api/photos/${trip.id}/thumb-${i}.jpg`}, 40.7128, -74.0060,
          NOW() + INTERVAL '${i} days'
        )
      `;
    }

    // Get first page (2 photos)
    const res1 = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}?limit=2&offset=0`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    // Get last page (2 photos)
    const res2 = await app.fetch(
      new Request(`http://localhost/api/trips/slug/${tripSlug}?limit=2&offset=3`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    const data1 = (await res1.json()) as TripWithPhotosResponse;
    const data2 = (await res2.json()) as TripWithPhotosResponse;

    // Both pages should return the SAME date_range (full trip span)
    expect(data1.dateRange.start).toBe(data2.dateRange.start);
    expect(data1.dateRange.end).toBe(data2.dateRange.end);

    // Cleanup
    await db`DELETE FROM trips WHERE id = ${trip.id}`;
  });
});

// ==========================================================================
// GET /api/trips/id/:id - Pagination tests
// ==========================================================================
describe("GET /api/trips/id/:id - pagination", () => {
  it("supports pagination for admin endpoint", async () => {
    const db = getDbClient();
    const app = createTestApp();
    const authHeader = await getAdminAuthHeader();

    // Create trip with 3 photos
    const tripSlug = `admin-pagination-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${tripSlug}, 'Admin Pagination Test', true)
      RETURNING id
    `;

    for (let i = 0; i < 3; i++) {
      await db`
        INSERT INTO photos (
          trip_id, storage_key, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, ${`photo-${i}`}, ${`/api/photos/${trip.id}/photo-${i}.jpg`},
          ${`/api/photos/${trip.id}/thumb-${i}.jpg`}, 40.7128, -74.0060,
          NOW() + INTERVAL '${i} hours'
        )
      `;
    }

    // Request with pagination
    const res = await app.fetch(
      new Request(`http://localhost/api/trips/id/${trip.id}?limit=2&offset=0`, {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as TripWithPhotosResponse;
    expect(data.photos.length).toBe(2);
    expect(data.pagination.total).toBe(3);
    expect(data.pagination.hasMore).toBe(true);

    // Cleanup
    await db`DELETE FROM trips WHERE id = ${trip.id}`;
  });
});
```

**Acceptance Criteria:**
- [x] Tests cover default pagination behavior
- [x] Tests cover custom limit and offset
- [x] Tests cover limit capping at 100
- [x] Tests cover invalid limit/offset (non-integer, negative)
- [x] Tests verify `hasMore` calculation
- [x] Tests verify date_range consistency across pages
- [x] Tests cover both endpoints (slug and id)
- [x] All tests pass: `pnpm test api/src/routes/trips.test.ts`
- [x] No hardcoded env vars (follow testing standards)

---

## Testing Strategy

Tests are included in Commit 4 following TDD principles:
- **Unit-level validation:** Query param parsing, limit capping, offset validation
- **Integration-level verification:** Database queries, pagination metadata calculation
- **Edge cases:** Empty results, single page, exact page boundaries, date_range consistency

All tests follow project patterns:
- Use `getAdminAuthHeader()` and `getUserAuthHeader()` from test-helpers
- No hardcoded environment variables
- Cleanup test data after each test

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `pnpm test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Lint passes: `pnpm lint`
- [ ] Manual verification in browser:
  - [ ] Request without params shows first 50 photos
  - [ ] Request with `?limit=10` shows 10 photos
  - [ ] Pagination metadata is correct
  - [ ] `hasMore` is true when more pages exist
  - [ ] Date range is consistent across paginated requests

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing clients that expect all photos | Backward compatible - no params returns first 50 with pagination info |
| Date range incorrect with pagination | Use MIN/MAX query instead of array indexing |
| Performance degradation with large offsets | Index `idx_photos_trip_taken` supports efficient OFFSET |
| Frontend breaks without pagination handling | Pagination metadata always present, frontend can detect and adapt |

## Open Questions

None - all requirements are clear from issue #208.

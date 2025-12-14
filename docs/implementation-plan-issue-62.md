# Implementation Plan: Update database.ts utilities for new API

**Issue:** #62
**Branch:** `feature/issue-62-update-database-utils-for-api`
**Complexity:** Medium
**Total Commits:** 8

## Overview

Migrate `app/src/utils/database.ts` from using Supabase client directly to using the new API client (`app/src/lib/api.ts`). The API returns camelCase responses, but existing code expects snake_case (Supabase types), so we'll transform API responses to maintain backward compatibility with minimal disruption to Views.

## Prerequisites

- [x] API client exists at `app/src/lib/api.ts`
- [x] Backend API routes implemented at `api/src/routes/trips.ts`
- [x] `useAuth` composable provides `getToken()` method

## Architecture

### Components Modified
- `app/src/utils/database.ts` - Replace Supabase calls with API calls

### Data Flow
```
View → database.ts utils → api.get/post/patch/delete → Backend API → Database
                          ↓
                   Transform camelCase → snake_case
                          ↓
                    Return to View (unchanged interface)
```

### Design Decisions

**Type Compatibility Strategy:**
- API returns camelCase (e.g., `coverPhotoUrl`, `isPublic`)
- Existing code expects snake_case (e.g., `cover_photo_url`, `is_public`)
- Solution: Transform API responses to snake_case in database.ts
- Result: Views don't need changes, type safety maintained

**Photo Count/Date Range Issue:**
- Current `getAllTrips()` computes `photo_count` and `date_range` via N+1 queries
- API doesn't provide this metadata yet
- Decision: Remove metadata for now, keep implementation simple
- Follow-up: Create separate issue to enhance API with metadata

**createPhotos() Limitation:**
- No `POST /api/trips/:id/photos` endpoint exists yet
- Decision: Keep using Supabase client temporarily
- Follow-up: Create separate issue for photos endpoint

## Atomic Commits

### Commit 1: Add API response types and transform utilities
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Add TypeScript interfaces for API responses (camelCase):
  - `ApiTripResponse` - matches backend `TripResponse`
  - `ApiPhotoResponse` - matches backend `PhotoResponse`
  - `ApiTripWithPhotosResponse` - matches backend `TripWithPhotosResponse`
- Add transform functions to convert API responses to database types:
  - `transformApiTrip()` - converts camelCase to snake_case for Trip
  - `transformApiPhoto()` - converts camelCase to snake_case for Photo
  - `transformApiTripWithPhotos()` - converts trip + photos
- Import `api` and `ApiError` from `@/lib/api`
- Import `useAuth` from `@/composables/useAuth` (for getToken)

**Acceptance Criteria:**
- [x] All API response types match backend exactly (camelCase)
- [x] Transform functions correctly map all fields to snake_case
- [x] No changes to existing function implementations yet
- [x] Types pass: `pnpm type-check`

---

### Commit 2: Migrate getAllTrips() to API
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Replace Supabase query with `api.get<{ trips: ApiTripResponse[] }>('/api/trips')`
- Transform each trip using `transformApiTrip()`
- Remove photo count and date range computation (N+1 queries)
- Update return type from `Trip & { photo_count: number; date_range: ... }` to just `Trip[]`
- Handle `ApiError` instead of Supabase errors
- Remove try/catch - let ApiError bubble up

**Before:**
```typescript
export async function getAllTrips(): Promise<
  (Trip & { photo_count: number; date_range: { start: string; end: string } })[]
> {
  // Supabase query + N+1 photo queries
}
```

**After:**
```typescript
export async function getAllTrips(): Promise<Trip[]> {
  const { trips } = await api.get<{ trips: ApiTripResponse[] }>('/api/trips')
  return trips.map(transformApiTrip)
}
```

**Acceptance Criteria:**
- [x] `getAllTrips()` returns `Trip[]` (no metadata)
- [x] Uses API client instead of Supabase
- [x] Transforms camelCase to snake_case correctly
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`
- [x] HomeView loads trips without errors

---

### Commit 3: Migrate getTripBySlug() to API
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Replace Edge Function fetch with `api.get()`
- Build URL path: `/api/trips/${slug}` with optional `?token=${token}` query param
- Transform response using `transformApiTripWithPhotos()`
- Simplify error handling using `ApiError` (has `.status` property)
- Remove manual fetch error handling - API client handles it
- Return `null` for 404, throw for other errors

**Before:**
```typescript
export async function getTripBySlug(slug: string, token?: string): Promise<(Trip & { photos: Photo[] }) | null> {
  const url = new URL(`${supabaseUrl}/functions/v1/get-trip`)
  // Manual fetch with complex error handling
}
```

**After:**
```typescript
export async function getTripBySlug(slug: string, token?: string): Promise<(Trip & { photos: Photo[] }) | null> {
  try {
    const path = token ? `/api/trips/${slug}?token=${token}` : `/api/trips/${slug}`
    const trip = await api.get<ApiTripWithPhotosResponse>(path)
    return transformApiTripWithPhotos(trip)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
```

**Acceptance Criteria:**
- [x] Public trips load without token
- [x] Private trips load with valid token
- [x] Invalid token throws 401 error
- [x] Non-existent trip returns null
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`
- [x] TripView loads trips correctly

---

### Commit 4: Migrate createTrip() to API
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Get auth token using `useAuth().getToken()`
- Set token on API client: `api.setToken(token)`
- Convert `TripInsert` (snake_case) to camelCase for API request body
- Call `api.post<ApiTripResponse>('/api/trips', body)`
- Transform response back to snake_case using `transformApiTrip()`
- Remove Supabase type assertions (`as unknown as never`)

**Implementation details:**
```typescript
export async function createTrip(trip: TripInsert): Promise<Trip> {
  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')

  api.setToken(token)

  // Transform snake_case input to camelCase for API
  const body = {
    title: trip.title,
    description: trip.description,
    slug: trip.slug,
    isPublic: trip.is_public,
    coverPhotoUrl: trip.cover_photo_url
  }

  const apiTrip = await api.post<ApiTripResponse>('/api/trips', body)
  return transformApiTrip(apiTrip)
}
```

**Acceptance Criteria:**
- [x] Creates trip successfully from AdminView
- [x] Returns trip with correct snake_case fields
- [x] Throws error if not authenticated
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`
- [x] Can upload trip in browser

---

### Commit 5: Migrate updateTripCoverPhoto() to API
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Get auth token and set on API client
- Call `api.patch('/api/trips/${tripId}', { coverPhotoUrl })`
- API returns updated trip but function returns `void` - ignore response
- Remove Supabase update call

**Before:**
```typescript
export async function updateTripCoverPhoto(tripId: string, coverPhotoUrl: string): Promise<void> {
  const updateData: TablesUpdate<'trips'> = { cover_photo_url: coverPhotoUrl }
  const { error } = await supabase.from('trips').update(updateData as unknown as never).eq('id', tripId)
  if (error) throw error
}
```

**After:**
```typescript
export async function updateTripCoverPhoto(tripId: string, coverPhotoUrl: string): Promise<void> {
  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')

  api.setToken(token)
  await api.patch(`/api/trips/${tripId}`, { coverPhotoUrl })
}
```

**Acceptance Criteria:**
- [x] Cover photo updates successfully
- [x] Works in AdminView after upload
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`

---

### Commit 6: Migrate deleteTrip() to API
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Get auth token and set on API client
- Call `api.delete('/api/trips/${tripId}')`
- Remove manual photo deletion (backend handles cascade)
- Keep console.log statements for debugging
- Remove Supabase delete calls

**Before:**
```typescript
export async function deleteTrip(tripId: string): Promise<void> {
  // Delete photos first
  const { error: photosError } = await supabase.from('photos').delete().eq('trip_id', tripId)
  if (photosError) throw photosError

  // Then delete trip
  const { error: tripError } = await supabase.from('trips').delete().eq('id', tripId)
  if (tripError) throw tripError
}
```

**After:**
```typescript
export async function deleteTrip(tripId: string): Promise<void> {
  console.log(`🗑️  Deleting trip ${tripId} and all associated photos...`)

  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')

  api.setToken(token)
  await api.delete(`/api/trips/${tripId}`)

  console.log(`✅ Trip ${tripId} and all photos deleted successfully`)
}
```

**Acceptance Criteria:**
- [x] Trip deletes successfully from TripView
- [x] Photos cascade delete (verified in database)
- [x] Console logs show deletion progress
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`
- [x] Deleting trip works in browser

---

### Commit 7: Migrate updateTripProtection() to API
**Type:** feat
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Replace Edge Function fetch with API client
- Call `api.patch('/api/trips/${tripId}/protection', { isPublic, token })`
- Set auth token on API client
- Remove manual response status handling (ApiError handles it)
- Simplify error messages - API provides them

**Before:**
```typescript
export async function updateTripProtection(
  tripId: string,
  isPublic: boolean,
  token: string | undefined,
  authToken: string
): Promise<void> {
  const url = `${supabaseUrl}/functions/v1/update-trip-protection`
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, ... },
    body: JSON.stringify({ tripId, isPublic, token })
  })
  // Manual status code handling
}
```

**After:**
```typescript
export async function updateTripProtection(
  tripId: string,
  isPublic: boolean,
  token: string | undefined,
  authToken: string
): Promise<void> {
  api.setToken(authToken)
  await api.patch(`/api/trips/${tripId}/protection`, { isPublic, token })
}
```

**Acceptance Criteria:**
- [x] Making trip public works (clears token)
- [x] Making trip private works (sets token)
- [x] Regenerating share link works
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`
- [x] Protection toggle works in TripView

---

### Commit 8: Clean up imports and add documentation
**Type:** refactor
**Scope:** utils/database

**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Remove unused Supabase imports if no longer needed
- Add JSDoc comment to `createPhotos()` explaining it still uses Supabase:
  ```typescript
  /**
   * Insert multiple photos for a trip
   *
   * @deprecated Temporarily still using Supabase client directly
   * TODO: Migrate to API endpoint once POST /api/trips/:id/photos is implemented
   * See: https://github.com/owner/repo/issues/XXX
   *
   * Note: Type assertion required due to Supabase-js v2.39 type inference limitations
   */
  ```
- Add file header comment explaining the migration status
- Remove `TablesUpdate` import if no longer used
- Keep `TablesInsert` and `TablesRow` for type definitions
- Keep Supabase client import for `createPhotos()`

**Acceptance Criteria:**
- [x] No unused imports remain
- [x] Documentation clearly explains temporary Supabase usage
- [x] File is well-organized and readable
- [x] Types pass: `pnpm type-check`
- [x] Lint passes: `pnpm lint`

---

## Testing Strategy

**Testing approach:**
- Manual browser testing after each commit (required by CLAUDE.md)
- Use Playwright to verify key user flows if important
- Run `pnpm test` and `pnpm type-check` before each commit

**Tests to write (if needed):**
- Unit tests for transform functions (Commit 1) - if complex
- Integration tests NOT needed - API routes already tested
- E2E tests NOT needed - existing Views will validate behavior

**Manual verification steps:**
1. After Commit 2: Visit HomeView, verify trips load
2. After Commit 3: Visit TripView, verify public/private trips load
3. After Commit 4: Upload new trip from AdminView
4. After Commit 5: Verify cover photo sets correctly
5. After Commit 6: Delete a trip, verify it's gone
6. After Commit 7: Toggle trip protection, verify share links

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes (`pnpm test`)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Manual verification in browser:
  - [ ] HomeView loads trips
  - [ ] TripView loads public trips
  - [ ] TripView loads private trips with token
  - [ ] AdminView can create trips
  - [ ] AdminView sets cover photo
  - [ ] TripView can delete trips
  - [ ] TripView can toggle protection
  - [ ] Share links work for private trips

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Type mismatches between camelCase/snake_case | Transform functions with explicit type tests, verify with type-check |
| Breaking existing Views | Keep function signatures identical, transform responses to match expected types |
| Auth token not available | Check `getToken()` returns value, throw clear error if missing |
| API errors differ from Supabase errors | ApiError class provides consistent `.status` property, Views already handle errors |
| Photo metadata missing from getAllTrips | Accept simplified return type, create follow-up issue for API enhancement |

## Open Questions

**RESOLVED:**
1. ~~Should we keep photo_count and date_range in getAllTrips?~~
   - Decision: Remove for now, defer to API enhancement issue

2. ~~How to handle createPhotos without API endpoint?~~
   - Decision: Keep using Supabase temporarily, create follow-up issue

**NONE REMAINING** - Ready to implement!

## Follow-up Issues to Create

After PR merges, create these issues:

1. **Enhance API trips endpoint with metadata**
   - Add `photoCount` and `dateRange` to `GET /api/trips` response
   - Update `getAllTrips()` to use new fields
   - Update HomeView to display metadata again

2. **Create photos API endpoint**
   - Implement `POST /api/trips/:id/photos` endpoint
   - Migrate `createPhotos()` in database.ts
   - Remove last Supabase client usage

3. **Update HomeView for simplified trip list**
   - Remove references to `photo_count` and `date_range`
   - Adjust UI to work without metadata temporarily
   - Or: Wait for follow-up issue #1 to complete

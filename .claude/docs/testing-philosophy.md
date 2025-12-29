# Testing Philosophy

This document outlines our approach to testing the Vacay Photo Map API. We prioritize **quality over quantity** by testing critical paths with shared infrastructure.

---

## Core Principles

1. **Test the contract, not the implementation**
   Focus on API behavior (inputs/outputs), not internal details.

2. **Cover critical paths, not every function**
   Auth, RBAC, data integrity, business logic. Skip trivial code.

3. **Keep tests simple and readable**
   Use descriptive names, clear Arrange-Act-Assert structure.

4. **Use shared infrastructure**
   Leverage `test-factories.ts`, `test-types.ts`, `test-helpers.ts`.

5. **Fail fast, fail clearly**
   Tests should point to the exact problem when they fail.

---

## Testing Pyramid

Our target distribution:

- **70% Unit tests** - Pure functions, business logic (EXIF parsing, GPS validation)
- **20% Integration tests** - API routes + database (trips, photos, auth)
- **10% E2E tests** - Playwright user flows (upload, view trip, share)

**Goal:** ~60 strategic tests, ~2,500 lines, <5 seconds execution.

---

## What to Test (Critical Paths)

### Auth Flows
- Registration (first user becomes admin, subsequent users are regular)
- Login (passkey challenge/verification)
- Token validation (JWT expiration, invalid tokens)

### RBAC (Role-Based Access Control)
- Trip access: owners can edit, editors can add photos, viewers can only see
- Admin privileges: view all trips, manage users
- Unauthorized access: reject non-owners editing trips

### Data Integrity
- Foreign key constraints: deleting user cascades to trips/photos
- Cascading deletes: trip deletion removes all photos
- Unique constraints: slug collision, username uniqueness

### API Contracts
- Request validation: required fields, type checking, format validation
- Response schemas: correct shape, status codes, error messages
- Edge cases: empty results, pagination, filtering

### External Dependencies
- R2 storage: fallback to filesystem when R2 unavailable
- File uploads: EXIF parsing, GPS extraction, thumbnail generation

### Business Logic
- EXIF parsing: extract GPS, handle missing data, `xmp: true` required
- GPS validation: reject null island (0,0), invalid coordinates
- Invite expiration: invites expire after 7 days, can't be used twice

---

## What NOT to Test (Anti-Patterns)

### Trivial Code
```typescript
// DON'T test simple getters
class User {
  getName() { return this.name }
}
```

### Framework Behavior
- Hono routing (tested by framework)
- Bun runtime (tested by maintainers)
- Database ORM internals

### Library Internals
- Sharp image processing (trust the library)
- EXIF parsing details (test our usage, not the library)

### Type Checking
```typescript
// DON'T test TypeScript types
interface User { id: string }
// Type errors caught at compile time, not runtime
```

### Exhaustive Input Combinations
Test representative cases, not every permutation:
```typescript
// DO: Test valid/invalid/edge cases
it('accepts valid coordinates', ...)
it('rejects null island', ...)
it('handles missing GPS data', ...)

// DON'T: Test every possible coordinate
it('accepts lat 45.0, lon 90.0', ...)
it('accepts lat 45.1, lon 90.1', ...)
// ... (infinite combinations)
```

---

## Test Structure

### Arrange-Act-Assert Pattern

```typescript
it('creates a trip for authenticated user', async () => {
  // Arrange: Set up test data
  const user = await createUser({ username: 'testuser' })
  const headers = await getUserAuthHeader(user.id)

  // Act: Perform the action
  const res = await app.request('/api/trips', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'My Trip' })
  })

  // Assert: Verify the outcome
  expect(res.status).toBe(201)
  const trip = await res.json<TripResponse>()
  expect(trip.title).toBe('My Trip')
  expect(trip.owner_id).toBe(user.id)
})
```

### One Assertion Per Test (When Possible)

```typescript
// GOOD: Clear, focused test
it('returns 404 for non-existent trip', async () => {
  const res = await app.request('/api/trips/99999')
  expect(res.status).toBe(404)
})

// ACCEPTABLE: Related assertions for single behavior
it('creates trip with correct data', async () => {
  const res = await app.request('/api/trips', { method: 'POST', ... })
  const trip = await res.json<TripResponse>()

  expect(trip.title).toBe('My Trip')        // Same object
  expect(trip.owner_id).toBe(user.id)       // Same behavior
  expect(trip.created_at).toBeDefined()     // Same response
})
```

### Clear Test Names

Describe **behavior**, not implementation:

```typescript
// GOOD
it('returns 403 when non-owner tries to edit trip', ...)
it('cascades trip deletion to all photos', ...)
it('extracts GPS from iPhone HEIC with xmp:true', ...)

// BAD (implementation details)
it('calls checkTripOwnership middleware', ...)
it('uses ON DELETE CASCADE', ...)
it('passes xmp option to exifr', ...)
```

---

## Using Shared Infrastructure

### Test Factories (`api/src/test-factories.ts`)

Create test data with cleanup:

```typescript
import { createUser, createTrip, createPhoto, cleanupTrip, cleanupUser } from '../test-factories'

describe('Trip deletion', () => {
  const createdTripIds: string[] = []
  const createdUserIds: string[] = []

  afterEach(async () => {
    for (const id of createdTripIds) await cleanupTrip(id)
    for (const id of createdUserIds) await cleanupUser(id)
    createdTripIds.length = 0
    createdUserIds.length = 0
  })

  it('cascades to photos', async () => {
    const user = await createUser()
    createdUserIds.push(user.id)
    const trip = await createTrip({ title: 'Vacation' })
    createdTripIds.push(trip.id)
    const photo = await createPhoto({ tripId: trip.id })

    await cleanupTrip(trip.id)  // Cascades to photos via FK

    // Trip and photos are now deleted
  })
})
```

**Available Factories:**
- `createUser(options?)` - Create user with optional `{ id, email, isAdmin, displayName }`
- `createTrip(options?)` - Create trip with optional `{ slug, title, isPublic, description }`
- `createPhoto(options)` - Create photo, requires `{ tripId }`, optional `{ key, latitude, longitude, takenAt }`

**Cleanup Helpers:**
- `cleanupUser(userId)` - Delete user
- `cleanupTrip(tripId)` - Delete trip (cascades to photos via FK)
- `cleanupPhoto(photoId)` - Delete photo

### Test Types (`api/src/test-types.ts`)

Type-safe response assertions:

```typescript
import type { TripResponse, TripListResponse, ErrorResponse } from '../test-types'

it('returns trip with correct shape', async () => {
  const res = await app.fetch(new Request('http://localhost/api/trips/my-trip'))
  const data = await res.json() as TripResponse

  expect(data.id).toBeDefined()
  expect(data.slug).toBeDefined()
  expect(data.title).toBeDefined()
})

it('returns trip list', async () => {
  const res = await app.fetch(new Request('http://localhost/api/trips'))
  const data = await res.json() as TripListResponse

  expect(Array.isArray(data.trips)).toBe(true)
})
```

### Test Helpers (`api/src/test-helpers.ts`)

Common operations:

```typescript
import { getAdminAuthHeader, getUserAuthHeader, createJpegFile } from '../test-helpers'

it('allows admin to view all trips', async () => {
  const headers = await getAdminAuthHeader()

  const res = await app.fetch(
    new Request('http://localhost/api/trips', { headers })
  )
  expect(res.status).toBe(200)
})

it('uploads photo with EXIF data', async () => {
  const trip = await createTrip()
  const headers = await getAdminAuthHeader()
  const file = createJpegFile()

  const formData = new FormData()
  formData.append('photo', file)
  formData.append('tripId', trip.id)

  const res = await app.fetch(
    new Request('http://localhost/api/upload', {
      method: 'POST',
      headers: { ...headers },
      body: formData,
    })
  )

  expect(res.status).toBe(201)
})
```

---

## Mocking Strategy

### When to Mock

**External services** that are slow or unreliable:

```typescript
import { mock } from 'bun:test'

// Mock R2 to use local filesystem fallback
mock.module('../utils/r2', () => ({
  uploadToR2: async () => false,  // Simulate R2 unavailable
  getFromR2: async () => null,
  isR2Available: () => false,
  deleteMultipleFromR2: async () => 0,
  PHOTOS_URL_PREFIX: '/api/photos/',
}))

describe('Photo upload', () => {
  it('falls back to filesystem when R2 unavailable', async () => {
    // R2 is mocked above - photos will save to local PHOTOS_DIR
    const res = await app.fetch(/* upload request */)
    expect(res.status).toBe(201)
  })
})
```

### When NOT to Mock

**Core dependencies** that are fast and essential:

- **Database**: Use real PostgreSQL (via Docker). Tests verify actual constraints.
- **JWT**: Use real signing/verification. Tests catch token bugs.
- **File operations**: Use real filesystem. Tests catch path/permission issues.

**Why?** Mocking these hides integration bugs. Real database = real constraints, real SQL errors.

---

## Test Cleanup

### Manual Cleanup Pattern

Track created IDs and clean up in `afterEach`:

```typescript
import { createUser, createTrip, cleanupTrip, cleanupUser } from '../test-factories'

describe('My test suite', () => {
  const createdTripIds: string[] = []
  const createdUserIds: string[] = []

  afterEach(async () => {
    // Clean trips first (may have FK to users)
    for (const id of createdTripIds) await cleanupTrip(id)
    for (const id of createdUserIds) await cleanupUser(id)
    createdTripIds.length = 0
    createdUserIds.length = 0
  })

  it('test 1', async () => {
    const user = await createUser()
    createdUserIds.push(user.id)
    const trip = await createTrip({ title: 'Test' })
    createdTripIds.push(trip.id)
    // ... test logic
  })
})
```

**How it works:**
- Track IDs in arrays as you create entities
- `afterEach` cleans up in correct order (respecting FK constraints)
- Database cascades handle related data (photos deleted with trips)

### Database Cascade

Our schema uses `ON DELETE CASCADE`:

```sql
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE
);
```

**Result:** Deleting a trip automatically deletes all its photos. Tests don't need manual cleanup for cascaded data.

---

## Running Tests

### All Tests

```bash
cd api
bun test
```

### Specific File

```bash
bun test src/routes/trips.test.ts
```

### Watch Mode

```bash
bun test --watch
```

### Coverage (Optional)

```bash
bun test --coverage
```

---

## Success Metrics

Our testing overhaul achieved:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Test files | 8 | 8 | Same |
| Total tests | 172 | ~60 | -65% |
| Lines of code | 4,766 | ~2,500 | -47% |
| Execution time | ~8s | <5s | -37% |
| Flaky tests | 3-5 | 0 | Fixed |

**Quality indicators:**
- 80%+ critical path coverage
- 0 flaky tests
- All tests use shared infrastructure
- Clear, scannable test names

---

## Real-World Examples

### Auth Flow Test

```typescript
import { describe, it, expect, afterEach } from 'bun:test'
import { createUser, cleanupUser } from '../test-factories'
import { getAdminAuthHeader } from '../test-helpers'
import type { ErrorResponse } from '../test-types'

describe('Auth: Protected endpoints', () => {
  const createdUserIds: string[] = []

  afterEach(async () => {
    for (const id of createdUserIds) await cleanupUser(id)
    createdUserIds.length = 0
  })

  it('rejects unauthenticated request', async () => {
    const res = await app.fetch(new Request('http://localhost/api/trips'))

    expect(res.status).toBe(401)
    const error = await res.json() as ErrorResponse
    expect(error.error).toBe('Unauthorized')
  })
})
```

### RBAC Test

```typescript
import { createUser, createTrip, cleanupTrip, cleanupUser } from '../test-factories'
import { getUserAuthHeader } from '../test-helpers'

describe('RBAC: Trip access', () => {
  const createdTripIds: string[] = []
  const createdUserIds: string[] = []

  afterEach(async () => {
    for (const id of createdTripIds) await cleanupTrip(id)
    for (const id of createdUserIds) await cleanupUser(id)
    createdTripIds.length = 0
    createdUserIds.length = 0
  })

  it('prevents non-admin from accessing admin endpoint', async () => {
    const user = await createUser({ isAdmin: false })
    createdUserIds.push(user.id)
    const headers = await getUserAuthHeader(user.id, user.email)

    const res = await app.fetch(
      new Request('http://localhost/api/trips/admin', { headers })
    )

    expect(res.status).toBe(403)
  })
})
```

### Data Integrity Test

```typescript
import { createTrip, createPhoto, cleanupTrip } from '../test-factories'
import { getDbClient } from '../db/client'

describe('Data integrity: Cascading deletes', () => {
  it('deletes all photos when trip is deleted', async () => {
    const db = getDbClient()
    const trip = await createTrip({ title: 'Test Trip' })
    await createPhoto({ tripId: trip.id })
    await createPhoto({ tripId: trip.id })

    // Delete trip - should cascade to photos
    await cleanupTrip(trip.id)

    // Verify photos are gone
    const photos = await db`SELECT * FROM photos WHERE trip_id = ${trip.id}`
    expect(photos.length).toBe(0)
  })
})
```

---

## Summary Checklist

When writing tests, ask yourself:

- [ ] Does this test a **critical path** (auth, RBAC, data integrity)?
- [ ] Am I testing the **contract** (API behavior), not implementation?
- [ ] Did I use **shared infrastructure** (factories, types, helpers)?
- [ ] Is the test **simple** and **readable**?
- [ ] Does it **fail clearly** when something breaks?
- [ ] Did I avoid mocking core dependencies (database, JWT)?
- [ ] Did I add cleanup using `cleanupTrip()`, `cleanupUser()`, etc.?

If all checkboxes are checked, you're following our testing philosophy.

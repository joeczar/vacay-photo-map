# Testing Standards

**Applies to:** `**/*.test.ts`, `**/test-*.ts`

## Testing Philosophy

**Read the full guide:** `.claude/docs/testing-philosophy.md`

**Core principles:**
- Test critical paths (auth, RBAC, data integrity), not every function
- Use shared infrastructure (`test-factories.ts`, `test-types.ts`, `test-helpers.ts`)
- Keep tests simple and readable (Arrange-Act-Assert)
- Focus on contracts, not implementation details

**Target metrics:**
- ~60 strategic tests (not 200+ exhaustive tests)
- 80%+ critical path coverage (not 100% line coverage)
- <5 seconds execution time

## Test Factories

**ALWAYS use test factories instead of duplicating database setup.**

Available in `src/test-factories.ts`:
- `createUser(options?)` - Create test user with optional overrides
- `createTrip(options?)` - Create test trip
- `createPhoto(options)` - Create test photo (requires tripId)
- `cleanupUser(userId)` - Delete user
- `cleanupTrip(tripId)` - Delete trip (cascades to photos, access, invites)
- `cleanupPhoto(photoId)` - Delete photo

### Example Usage:

```typescript
import { describe, it, expect, afterEach } from 'bun:test'
import { createUser, createTrip, cleanupTrip } from '../test-factories'
import { getAdminAuthHeader } from '../test-helpers'
import type { TripListResponse } from '../test-types'

describe('Trip Access', () => {
  let tripId: string

  afterEach(async () => {
    if (tripId) await cleanupTrip(tripId)
  })

  it('admin can access all trips', async () => {
    const trip = await createTrip({ title: 'Admin Trip' })
    tripId = trip.id
    const headers = await getAdminAuthHeader()

    const res = await app.fetch(
      new Request('http://localhost/api/trips', { headers })
    )

    expect(res.status).toBe(200)
  })
})
```

### Violations:

```typescript
// WRONG - Duplicating factory
const [trip] = await db`
  INSERT INTO trips (slug, title, is_public)
  VALUES ('test-trip-123', 'Test Trip', true)
  RETURNING id
`

// CORRECT - Use factory
const trip = await createTrip({ slug: 'test-trip-123', title: 'Test Trip' })
```

## Response Types

**ALWAYS import response types instead of duplicating interfaces.**

Available in `src/test-types.ts`:
- `ErrorResponse` - `{ error: string; message: string }`
- `TripListResponse` - `{ trips: TripResponse[] }`
- `TripResponse`, `TripWithPhotosResponse` - Trip data
- `PhotoResponse` - Photo data
- `SuccessResponse` - `{ success: boolean; message?: string }`
- `AuthResponse` - Auth token + user profile
- `InviteResponse`, `InviteListResponse` - Invite data

### Example Usage:

```typescript
import type { ErrorResponse, TripListResponse } from '../test-types'

it('returns 404 for missing trip', async () => {
  const res = await app.fetch(new Request('http://localhost/api/trips/missing'))
  expect(res.status).toBe(404)

  const data = await res.json() as ErrorResponse
  expect(data.error).toBeDefined()
})
```

### Violations:

```typescript
// WRONG - Duplicating interface
interface ErrorResponse {
  error: string
  message: string
}

// CORRECT - Import shared type
import type { ErrorResponse } from '../test-types'
```

## Environment Variables in Tests

**NEVER hardcode environment variables in test files.**

### Violations (DO NOT DO THIS):

```typescript
// WRONG - Hardcoded secrets
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
```

### Correct Pattern:

```typescript
// CORRECT - No env setup needed
import { describe, it, expect } from 'bun:test'
import { getAdminAuthHeader } from '../test-helpers'

// Environment loaded automatically from .env.test via bunfig.toml preload
```

## Test Helpers

**Use shared test helpers instead of duplicating.**

Available in `src/test-helpers.ts`:
- `getAdminAuthHeader()` - Admin JWT token
- `getUserAuthHeader()` - Regular user JWT token
- `uniqueIp()` - Unique IP for rate limit tests
- `createRequestWithUniqueIp()` - Request with unique IP
- `createJpegFile()`, `createPngFile()`, `createWebpFile()` - Test files
- `createFormData()` - FormData with file

### Entity Factories (`src/test-factories.ts`)
- `createUser(options?)`, `createTrip(options?)`, `createPhoto(options)`
- `cleanupUser()`, `cleanupTrip()`, `cleanupPhoto()` - Cleanup helpers

### Response Types (`src/test-types.ts`)
- `ErrorResponse`, `SuccessResponse`, `TripListResponse`, `TripResponse`
- `PhotoResponse`, `AuthResponse`, `InviteResponse`

### Violations:

```typescript
// WRONG - Duplicating helper
async function getAdminAuthHeader() {
  const token = await signToken({ sub: 'admin', isAdmin: true })
  return { Authorization: `Bearer ${token}` }
}
```

### Correct Pattern:

```typescript
// CORRECT - Import shared helper
import { getAdminAuthHeader } from '../test-helpers'
```

## What NOT to Test

**Avoid testing these (see philosophy doc for details):**
- ❌ Trivial getters/setters
- ❌ Framework behavior (Hono routing, Bun runtime)
- ❌ Library internals (Sharp, EXIF parsing)
- ❌ TypeScript type checking
- ❌ Every possible input combination

## Configuration Files

- `.env.test` - Test environment variables (gitignored)
- `.env.test.example` - Template for developers
- `bunfig.toml` - Test runner config with preload
- `src/test-setup.ts` - Preloaded environment loader
- `src/test-helpers.ts` - Shared test utilities

## Running Tests

```bash
# Setup (one time)
cp .env.test.example .env.test

# Run tests
bun test

# Tests in CI
# GitHub Actions sets env vars directly, .env.test not needed
```

## Why This Matters

1. **Security**: Hardcoded secrets in code can leak in commits/PRs
2. **Consistency**: Single source of truth for test configuration
3. **Maintainability**: Change config once, not in 5+ files
4. **CI Compatibility**: Env vars work same locally and in CI

## When Writing Tests

1. Import helpers from `test-helpers.ts`
2. Never set `process.env.*` in test files
3. Use `.env.test` for local configuration
4. Add new helpers to `test-helpers.ts` if reusable across files

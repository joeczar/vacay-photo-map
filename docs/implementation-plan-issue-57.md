# Implementation Plan: Issue #57 - Trip Endpoints (CRUD + Protection)

## Summary

Implement trip management API endpoints with proper access control, replacing the existing Supabase Edge Function.

## Research Findings

### Existing Patterns

1. **Route Structure**: Uses Hono with separate route files (e.g., `auth.ts`, `health.ts`)
2. **Database**: postgres.js client with connection pooling in `db/client.ts`
3. **Auth Middleware**: Three variants available:
   - `requireAuth` - Requires valid JWT
   - `requireAdmin` - Requires valid JWT with `isAdmin: true`
   - `optionalAuth` - Parses JWT if present, continues without
4. **Type Pattern**: Uses `AuthEnv` for Hono environment typing
5. **Testing**: Bun test runner with test helper functions for unique IPs and auth headers

### Database Schema

```sql
trips (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  access_token_hash TEXT,  -- bcrypt hash of protection token
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

photos (
  id UUID PRIMARY KEY,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  -- ... other fields
)
```

### Access Control Logic

1. **Public trips** (`is_public = true`): Return trip + photos to anyone
2. **Private trips** (`is_public = false`):
   - Admin JWT: Return trip + photos
   - Valid token query param: Return trip + photos (compare with bcrypt)
   - No/invalid token: 401 Unauthorized

## Implementation Tasks

### 1. Create Trip Routes File

**File**: `api/src/routes/trips.ts`

```typescript
// Endpoints to implement:
// GET /api/trips - List all public trips (optionalAuth)
// GET /api/trips/:slug - Get trip by slug with access control
// POST /api/trips - Create trip (requireAdmin)
// PATCH /api/trips/:id - Update trip (requireAdmin)
// DELETE /api/trips/:id - Delete trip (requireAdmin)
// PATCH /api/trips/:id/protection - Update protection settings (requireAdmin)
```

### 2. Database Types

```typescript
interface DbTrip {
  id: string
  slug: string
  title: string
  description: string | null
  cover_photo_url: string | null
  is_public: boolean
  access_token_hash: string | null
  created_at: Date
  updated_at: Date
}

interface DbPhoto {
  id: string
  trip_id: string
  cloudinary_public_id: string
  url: string
  thumbnail_url: string
  latitude: number | null
  longitude: number | null
  taken_at: Date
  caption: string | null
  album: string | null
  created_at: Date
}
```

### 3. Token Hashing

- Use bcrypt for hashing protection tokens
- Need to add `bcrypt` dependency OR use built-in Bun.password API
- Bun has native password hashing: `Bun.password.hash()` and `Bun.password.verify()`

### 4. Endpoint Specifications

#### GET /api/trips
- **Auth**: None required (optionalAuth for future filtering)
- **Response**: Array of public trips without photos
- **Query Params**: None initially (pagination can be added later)

#### GET /api/trips/:slug
- **Auth**: optionalAuth
- **Logic**:
  1. Find trip by slug
  2. If not found: 404
  3. If public: return with photos
  4. If private:
     - If admin JWT: return with photos
     - If `?token=xxx` matches hash: return with photos
     - Else: 401
- **Response**: Trip object with photos array

#### POST /api/trips
- **Auth**: requireAdmin
- **Body**: `{ slug, title, description?, coverPhotoUrl?, isPublic? }`
- **Response**: 201 with created trip

#### PATCH /api/trips/:id
- **Auth**: requireAdmin
- **Body**: Partial trip fields (except id, timestamps)
- **Response**: 200 with updated trip

#### DELETE /api/trips/:id
- **Auth**: requireAdmin
- **Response**: 204 No Content
- **Note**: Cascade deletes photos via DB constraint

#### PATCH /api/trips/:id/protection
- **Auth**: requireAdmin
- **Body**: `{ isPublic: boolean, token?: string }`
- **Logic**:
  - If setting private with token: hash and store
  - If setting public: clear token hash
- **Response**: 200 with success status

### 5. Register Routes

Update `api/src/index.ts`:
```typescript
import { trips } from './routes/trips'
app.route('/api/trips', trips)
```

### 6. Testing Strategy

Create `api/src/routes/trips.test.ts`:
- Test each endpoint's success path
- Test auth requirements (401/403 responses)
- Test access control for private trips
- Test token validation for protected trips

## Dependencies

- No new dependencies needed - Bun has native password hashing

## Risks and Mitigations

1. **Risk**: bcrypt timing attacks
   - **Mitigation**: Use constant-time comparison (Bun.password.verify handles this)

2. **Risk**: Slug collisions
   - **Mitigation**: Database unique constraint, return 409 Conflict

3. **Risk**: Performance with many photos
   - **Mitigation**: Can add pagination later; for now trips have limited photos

## Acceptance Criteria Checklist

- [ ] Public trips accessible without auth
- [ ] Private trips require valid token OR admin JWT
- [ ] CRUD operations work for admins
- [ ] Token hashing works with bcrypt/Bun.password
- [ ] Cascade delete removes photos
- [ ] All tests pass

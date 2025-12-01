# Implementation Plan: Issue #32 - Update Trip Fetching to Use Edge Function

## Branch Name
`feature/issue-32-use-edge-function`

## Issue Context
**Issue #32:** Update trip fetching to use Edge Function
**Milestone:** Milestone 2 - Authentication & Trip Protection

**What This Solves:**
Refactor the frontend trip fetching logic to use the new Supabase Edge Function (completed in Issue #31, PR #45) instead of directly querying the database. This enables server-side access control for protected trips using share-link tokens.

**Current State:**
- Edge Function deployed and tested at `/functions/v1/get-trip` (PR #45, merged today)
- Frontend still uses direct database queries via `getTripBySlug()` in `database.ts`
- `TripView.vue` doesn't read token from URL query parameters
- No error handling for 401 Unauthorized responses

**Desired State:**
- Frontend calls Edge Function for all trip fetching
- Token read from URL query params and passed to Edge Function
- 401 errors handled gracefully (sets up Issue #33)
- Public trips work without tokens
- Private trips with valid tokens load correctly

## Prerequisites
✅ Edge Function deployed at `/functions/v1/get-trip` (Issue #31 complete)
✅ Database schema with `access_token_hash` field
✅ Supabase anon key configured in `.env`
✅ Trip protection system understood (share-link approach from #39)

## Architecture Overview

### Current Flow (Direct Database)
```
TripView.vue
  → getTripBySlug(slug)
    → supabase.from('trips').select()
    → Returns trip or null
```

### New Flow (Edge Function)
```
TripView.vue
  → Read token from route.query.token
  → getTripBySlug(slug, token)
    → fetch(`${SUPABASE_URL}/functions/v1/get-trip?slug=X&token=Y`)
    → Edge Function validates access
    → Returns trip data (200) or error (401/404)
```

### Key Changes
1. `getTripBySlug()` becomes an HTTP fetch to Edge Function
2. Function signature changes to accept optional `token` parameter
3. Returns same data structure but through different transport
4. Error handling distinguishes between 401 (unauthorized) and other errors

## Implementation Steps

### Step 1: Update `getTripBySlug()` Function

**File:** `/Users/joeczarnecki/Code/personal/vacay-photo-map/app/src/utils/database.ts`

**Current Implementation (lines 44-70):**
```typescript
export async function getTripBySlug(slug: string): Promise<(Trip & { photos: Photo[] }) | null> {
  const tripResult = (await supabase.from('trips').select('*').eq('slug', slug).single()) as {
    data: Trip | null
    error: unknown
  }
  // ... rest of implementation
}
```

**New Implementation:**
```typescript
/**
 * Get a trip by slug with all photos via Edge Function
 * Handles access control for public and protected trips
 * @param slug - Trip slug identifier
 * @param token - Optional access token for protected trips
 * @returns Trip with photos or null if not found/unauthorized
 * @throws Error with status code for proper error handling
 */
export async function getTripBySlug(
  slug: string,
  token?: string
): Promise<(Trip & { photos: Photo[] }) | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL environment variable')
  }

  // Build URL with query parameters
  const url = new URL(`${supabaseUrl}/functions/v1/get-trip`)
  url.searchParams.set('slug', slug)
  if (token) {
    url.searchParams.set('token', token)
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header needed - using query params for token
      },
    })

    // Handle unauthorized access (missing/invalid token)
    if (response.status === 401) {
      const error = new Error('Unauthorized') as Error & { status: number }
      error.status = 401
      throw error
    }

    // Handle other errors
    if (!response.ok) {
      const error = new Error(`HTTP error ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    const trip = await response.json()
    return trip as (Trip & { photos: Photo[] })
  } catch (error) {
    // Re-throw errors with status codes for proper handling in TripView
    if (error instanceof Error && 'status' in error) {
      throw error
    }

    // Network or other errors
    console.error('Error fetching trip:', error)
    return null
  }
}
```

**Why This Approach:**
- Maintains same return type as existing code (minimal breaking changes)
- Uses extended Error type with `status` property for error handling
- Throws on 401 to distinguish from "not found" (null return)
- Network errors return null (graceful degradation)
- No breaking changes to other callers (getAllTrips, etc. unchanged)

### Step 2: Update TripView.vue to Read Token

**File:** `/Users/joeczarnecki/Code/personal/vacay-photo-map/app/src/views/TripView.vue`

**Changes Required:**

1. **Add token reading (after line 235):**
```typescript
const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string
const token = route.query.token as string | undefined  // NEW
```

2. **Update trip fetching (lines 248-262):**
```typescript
// Load trip data
onMounted(async () => {
  try {
    const data = await getTripBySlug(slug, token)  // Pass token
    if (!data) {
      error.value = 'Trip not found'
    } else {
      trip.value = data
    }
  } catch (err) {
    console.error('Error loading trip:', err)

    // Handle 401 Unauthorized specifically
    if (err instanceof Error && 'status' in err && (err as any).status === 401) {
      error.value = 'This trip is private. Please use the link provided by the trip owner.'
    } else {
      error.value = 'Failed to load trip'
    }
  } finally {
    loading.value = false
  }
})
```

**Why This Approach:**
- Token automatically available when user clicks share link
- 401 errors show specific message (implements part of Issue #33)
- Other errors show generic message
- Backwards compatible with existing public trips (no token in URL)

### Step 3: Update Import in TripView.vue

**File:** `/Users/joeczarnecki/Code/personal/vacay-photo-map/app/src/views/TripView.vue`

**Current import (line 213):**
```typescript
import { getTripBySlug, deleteTrip } from '@/utils/database'
```

**No change needed** - function signature is backwards compatible, optional parameter won't break import.

### Step 4: Verify Other Callers

Check if `getTripBySlug()` is used elsewhere:

```bash
# Search for other usages
grep -r "getTripBySlug" app/src/
```

**Expected Results:**
- Only `TripView.vue` should be calling this function
- If other callers exist, they'll still work (token is optional)

### Step 5: Type Safety Check

Ensure TypeScript is happy with changes:

```bash
cd app && pnpm type-check
```

**Expected Issues:**
- None - optional parameter is backwards compatible
- Error type extension is valid TypeScript

## Testing Strategy

### Manual Testing Checklist

**Test Public Trips:**
1. Navigate to existing public trip (e.g., `/trip/california-roadtrip`)
2. Should load normally without token
3. Verify all photos, map, and metadata display correctly
4. Check console for no errors

**Test Protected Trips (Requires Setup):**
1. Create a test protected trip in database or admin UI (if available)
2. Generate share link with token
3. Visit link with token in URL: `/trip/test-trip?token=abc123xyz`
4. Should load trip successfully if token is valid

**Test Error Cases:**
1. Visit protected trip without token: `/trip/protected-trip`
   - Should show error: "This trip is private. Please use the link provided..."
2. Visit protected trip with invalid token: `/trip/protected-trip?token=invalid`
   - Should show same error message
3. Visit non-existent trip: `/trip/does-not-exist`
   - Should show: "Trip not found"

**Test Network Failures:**
1. Disconnect network and try loading trip
2. Should show: "Failed to load trip"

### Automated Testing (Future - Issue #35)

This issue focuses on functionality. Playwright tests will be added in Issue #35:
- Test public trip access
- Test protected trip with valid token
- Test protected trip without token (401 flow)
- Test invalid token handling

### Type Check Testing

```bash
cd app && pnpm type-check
```

**Success Criteria:**
- No TypeScript errors
- All type assertions valid

### Browser DevTools Testing

1. Open Network tab
2. Load trip page
3. Verify request goes to `/functions/v1/get-trip`
4. Check query parameters include `slug` and `token` (if present)
5. Verify response structure matches expected Trip type

## Known Gotchas

### 1. Environment Variable Access
**Issue:** Edge Function URL needs `VITE_SUPABASE_URL`
**Solution:** Already configured in `.env`, just access via `import.meta.env`

### 2. CORS Configuration
**Issue:** Edge Function must allow CORS from frontend
**Status:** ✅ Already handled in Edge Function (Issue #31)

### 3. Error Type Extension
**Issue:** TypeScript doesn't natively support `Error & { status: number }`
**Solution:** Use type assertion and instanceof checks in catch blocks

### 4. Token in URL Query Params
**Issue:** Token visible in browser URL bar
**Status:** ✅ Acceptable for share-link approach (not sensitive after first use)

### 5. getAllTrips() Still Uses Direct Database
**Issue:** Home page still queries database directly
**Status:** ✅ Intentional - only individual trip fetching needs protection
**Note:** getAllTrips() filters to `is_public = true` so no protection needed

### 6. Edge Function Response Format
**Issue:** Must match exact structure of current database query
**Status:** ✅ Edge Function returns same structure (verified in Issue #31 testing)

### 7. Loading State During Fetch
**Issue:** Network requests take longer than database queries
**Status:** ✅ Loading state already exists in TripView (lines 13-18)

## Success Criteria

✅ `getTripBySlug()` calls Edge Function instead of database
✅ Token read from URL query params in TripView
✅ Public trips load without token
✅ Protected trips with valid token load correctly
✅ Protected trips without token show 401 error message
✅ Invalid tokens show 401 error message
✅ Non-existent trips show "Trip not found"
✅ Type checking passes with no errors
✅ No breaking changes to existing public trip functionality
✅ Console shows no errors for successful requests

## Rollback Strategy

If issues arise after deployment:

### Immediate Rollback (Revert Changes)
```bash
git revert <commit-sha>
git push origin main
```

### Quick Fix Options

**Option 1: Keep both implementations**
```typescript
// Add feature flag
const USE_EDGE_FUNCTION = import.meta.env.VITE_USE_EDGE_FUNCTION === 'true'

export async function getTripBySlug(slug: string, token?: string) {
  if (USE_EDGE_FUNCTION) {
    return getTripBySlugViaEdgeFunction(slug, token)
  }
  return getTripBySlugViaDatabase(slug)
}
```

**Option 2: Edge Function Fallback**
```typescript
export async function getTripBySlug(slug: string, token?: string) {
  try {
    return await getTripBySlugViaEdgeFunction(slug, token)
  } catch (error) {
    console.warn('Edge function failed, falling back to database')
    return await getTripBySlugViaDatabase(slug)
  }
}
```

**When to Use:**
- Use Option 1 if Edge Function is unstable
- Use Option 2 if Edge Function has intermittent issues
- Full revert if fundamental problem with approach

## Files to Modify

### Modify
1. `/Users/joeczarnecki/Code/personal/vacay-photo-map/app/src/utils/database.ts`
   - Update `getTripBySlug()` function (lines 44-70)
   - Add token parameter
   - Change from Supabase query to fetch() call
   - Add error handling with status codes

2. `/Users/joeczarnecki/Code/personal/vacay-photo-map/app/src/views/TripView.vue`
   - Read token from `route.query.token` (after line 235)
   - Pass token to `getTripBySlug()` (line 250)
   - Update error handling to detect 401 status (lines 248-262)

### No Changes Needed
- `/app/src/lib/supabase.ts` - Still used by other functions
- `/app/src/utils/database.ts` - Other functions (createTrip, getAllTrips, etc.) unchanged
- Type definitions in `database.types.ts` - No schema changes

## Testing Before Commit

**Required Steps:**
1. Run type checker: `cd app && pnpm type-check`
2. Test public trip in browser
3. Test protected trip with token (if available)
4. Test protected trip without token
5. Check Network tab for correct Edge Function calls
6. Verify no console errors

**Do NOT commit if:**
- Type check fails
- Public trips break
- Network requests fail
- Console shows unexpected errors

## Next Steps

After Issue #32 is complete and merged:

1. **Issue #33** - Enhance error UI with better styling
2. **Issue #34** - Build admin UI to toggle trip protection
3. **Issue #35** - Add Playwright tests for token flow
4. **Issue #37** - Implement Cloudinary signed URLs

## References

- Issue #31 - Edge Function implementation (completed)
- Issue #33 - Error message UI enhancement (blocked by this)
- Issue #39 - Share-link token approach decision
- PR #45 - Edge Function implementation and testing
- Edge Function code: `/Users/joeczarnecki/Code/personal/vacay-photo-map/supabase/functions/get-trip/index.ts`

## Estimated Complexity

**Time Estimate:** 30-60 minutes
**Difficulty:** Medium
**Risk Level:** Low (easy to rollback, well-tested Edge Function)

**Complexity Factors:**
- Simple refactor of existing function
- Edge Function already tested and working
- Error handling is straightforward
- No database changes needed
- Backwards compatible with existing code

**Risk Mitigation:**
- Edge Function thoroughly tested in Issue #31
- Optional token parameter maintains backwards compatibility
- Error handling gracefully degrades
- Rollback strategy documented above

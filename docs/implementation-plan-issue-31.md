# Implementation Plan: Issue #31 - Create Supabase Edge Function for Trip Fetching

## Branch Name
`feature/issue-31-edge-function-trip-fetching`

## Issue Context
**Issue #31:** Create Supabase Edge Function for trip fetching
**Goal:** Implement server-side trip access control with token validation

This Edge Function will handle trip fetching with proper access control:
- Public trips: Return without authentication
- Private trips: Require valid token validation
- Admin users: Bypass all checks (future-ready)

## Prerequisites
✅ Supabase CLI configured (completed)
✅ Database schema with `trips.access_token_hash` (completed)
✅ Share-link token generation utility (completed in #39)

## Architecture Overview

The Edge Function will:
1. Accept GET requests with `slug` and optional `token` query parameters
2. Fetch trip data from database
3. Apply access control logic:
   - Public trips → Return immediately
   - Private trips → Validate token with bcrypt
   - Admin users → Bypass checks (stub for now)
4. Return trip with photos or 401 Unauthorized

### Request Flow
```
Client → GET /functions/v1/get-trip?slug=california&token=abc123
       → Edge Function validates access
       → Returns trip data or 401
```

## Implementation Steps

### Step 1: Initialize Edge Function

1. Create Edge Function structure:
```bash
supabase functions new get-trip
```

2. This creates:
   - `/Users/joeczarnecki/Code/personal/vacay-photo-map/supabase/functions/get-trip/index.ts`

### Step 2: Install Dependencies

1. Create deno.json in function directory:
```json
{
  "imports": {
    "bcrypt": "https://deno.land/x/bcrypt@v0.4.1/mod.ts"
  }
}
```

### Step 3: Implement Edge Function Logic

File: `supabase/functions/get-trip/index.ts`

Key implementation points:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts"

serve(async (req: Request) => {
  // 1. Parse query parameters
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')
  const token = url.searchParams.get('token')

  // 2. Initialize Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 3. Check for authenticated admin (stub for now)
  const authHeader = req.headers.get('Authorization')
  // TODO: Implement admin check when auth is ready

  // 4. Fetch trip by slug
  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      *,
      photos (*)
    `)
    .eq('slug', slug)
    .single()

  // 5. Handle trip not found
  if (error || !trip) {
    return new Response(JSON.stringify({ error: 'Trip not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // 6. Check if trip is public
  if (trip.is_public) {
    return new Response(JSON.stringify(trip), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // 7. For private trips, validate token
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // 8. Compare token with hash
  const isValid = await bcrypt.compare(token, trip.access_token_hash)

  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // 9. Return trip data
  return new Response(JSON.stringify(trip), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### Step 4: Configure CORS

Add CORS headers for local development:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}
```

### Step 5: Deploy Edge Function

1. Deploy to Supabase:
```bash
supabase functions deploy get-trip
```

2. Set environment variables if needed:
```bash
supabase secrets set FUNCTION_SECRET=value
```

### Step 6: Test Edge Function

Create test file: `supabase/functions/get-trip/index.test.ts`

Test scenarios:
1. Public trip without token → 200 OK
2. Public trip with token → 200 OK (token ignored)
3. Private trip without token → 401 Unauthorized
4. Private trip with invalid token → 401 Unauthorized
5. Private trip with valid token → 200 OK
6. Non-existent trip → 404 Not Found
7. Malformed request → 400 Bad Request

### Step 7: Local Testing Script

Create a test script to verify locally:
```bash
# Test public trip
curl http://localhost:54321/functions/v1/get-trip?slug=california-roadtrip

# Test private trip without token
curl http://localhost:54321/functions/v1/get-trip?slug=private-trip

# Test private trip with token
curl "http://localhost:54321/functions/v1/get-trip?slug=private-trip&token=abc123xyz"
```

## Testing Strategy

### Unit Testing
- Mock Supabase client responses
- Test bcrypt comparison logic
- Test error handling

### Integration Testing
- Use real Supabase local instance
- Create test trips with known tokens
- Verify end-to-end flow

### Manual Testing
1. Create a public trip and verify access
2. Create a private trip with token
3. Test with correct token → success
4. Test with wrong token → 401
5. Test without token → 401

## Known Gotchas

- **CORS:** Must handle preflight OPTIONS requests
- **Service Role Key:** Use service role key, not anon key, for database access
- **Bcrypt:** Deno's bcrypt module may have different behavior than Node.js
- **Error Messages:** Don't leak information about token validity
- **Response Format:** Maintain same structure as current `getTripBySlug()`

## Success Criteria

✅ Edge Function deployed and accessible
✅ Public trips load without authentication
✅ Private trips require valid token
✅ Invalid/missing tokens return 401
✅ Trip not found returns 404
✅ CORS configured for frontend access
✅ Response format matches existing API
✅ All tests passing

## Files to Modify/Create

### Create
- `/supabase/functions/get-trip/index.ts` - Main Edge Function
- `/supabase/functions/get-trip/deno.json` - Dependencies
- `/supabase/functions/get-trip/index.test.ts` - Tests

### Modify
- None in this issue - frontend integration is issue #32

## Next Steps

After this issue is complete:
1. Issue #32 - Update frontend to use Edge Function
2. Issue #33 - Add error handling UI
3. Issue #34 - Build admin UI for protection
4. Issue #35 - Playwright testing of full flow

## References

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Deploy Docs](https://deno.com/deploy/docs)
- [bcrypt for Deno](https://deno.land/x/bcrypt)
- Issue #39 - Share-link token implementation
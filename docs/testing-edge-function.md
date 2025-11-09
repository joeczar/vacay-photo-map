# Testing the get-trip Edge Function

This document describes how to manually test the `get-trip` Edge Function for Issue #31.

## Prerequisites

1. Supabase project deployed and running
2. At least one public trip in the database
3. At least one private trip with an access token

## Testing Scenarios

### 1. Public Trip (No Token Required)

Test that public trips are accessible without authentication:

```bash
# Replace {project-ref} with your Supabase project reference
# Replace {slug} with an actual public trip slug
curl 'https://{project-ref}.supabase.co/functions/v1/get-trip?slug={slug}'
```

**Expected Result:**
- Status: 200 OK
- Response contains trip data with photos array

### 2. Private Trip Without Token

Test that private trips require authentication:

```bash
# Replace {slug} with a private trip slug
curl 'https://{project-ref}.supabase.co/functions/v1/get-trip?slug={slug}'
```

**Expected Result:**
- Status: 401 Unauthorized
- Response: `{"error": "Unauthorized"}`

### 3. Private Trip With Invalid Token

Test that invalid tokens are rejected:

```bash
# Replace {slug} with a private trip slug
curl 'https://{project-ref}.supabase.co/functions/v1/get-trip?slug={slug}&token=invalid-token'
```

**Expected Result:**
- Status: 401 Unauthorized
- Response: `{"error": "Unauthorized"}`

### 4. Private Trip With Valid Token

Test that valid tokens grant access:

```bash
# Replace {slug} with a private trip slug
# Replace {token} with the actual 3-word token (e.g., "hammer-sunset-bridge")
curl 'https://{project-ref}.supabase.co/functions/v1/get-trip?slug={slug}&token={token}'
```

**Expected Result:**
- Status: 200 OK
- Response contains trip data with photos array

### 5. Non-Existent Trip

Test that non-existent trips return generic error for security:

```bash
curl 'https://{project-ref}.supabase.co/functions/v1/get-trip?slug=non-existent-trip-123'
```

**Expected Result:**
- Status: 401 Unauthorized
- Response: `{"error": "Unauthorized"}`

### 6. Missing Slug Parameter

Test that missing slug parameter is handled:

```bash
curl 'https://{project-ref}.supabase.co/functions/v1/get-trip'
```

**Expected Result:**
- Status: 400 Bad Request
- Response: `{"error": "Missing slug parameter"}`

## Local Testing (Requires Docker)

If you have Docker running and want to test locally:

```bash
# Start Supabase local instance
supabase start

# Test against local instance
curl 'http://127.0.0.1:54321/functions/v1/get-trip?slug={slug}'
```

## Security Notes

1. All authentication failures return the same generic "Unauthorized" error
2. This prevents information leakage about:
   - Whether a trip exists
   - Whether a trip is public or private
   - Whether a token is close to being correct
3. Only valid combinations return trip data

## Response Format

Successful responses match the format of the existing `getTripBySlug()` function:

```json
{
  "id": "uuid",
  "slug": "trip-slug",
  "title": "Trip Name",
  "description": "Trip description",
  "is_public": false,
  "access_token_hash": "bcrypt-hash",
  "cover_photo_url": "https://...",
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T00:00:00.000Z",
  "photos": [
    {
      "id": "uuid",
      "trip_id": "uuid",
      "cloudinary_public_id": "...",
      "url": "https://...",
      "thumbnail_url": "https://...",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "taken_at": "2025-01-01T12:00:00.000Z",
      "caption": null,
      "album": null,
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

## Next Steps

After verifying the Edge Function works:
1. Issue #32 - Update frontend to use Edge Function
2. Issue #33 - Add error handling UI
3. Issue #34 - Build admin UI for protection
4. Issue #35 - Playwright testing of full flow

# Implementation Plan: Image Format Optimization

**Issue:** #207
**Branch:** `feature/issue-207-format-optimization`
**Complexity:** Simple
**Total Commits:** 2

## Overview

Fix the Cloudflare Worker image transformer to explicitly detect and use the best supported image format (AVIF > WebP > JPEG) based on browser Accept headers. Currently, `format: 'auto'` triggers a warning and doesn't work in Workers context, causing all images to be served as JPEG instead of modern formats.

**Expected Impact:**
- WebP: ~25-35% smaller than JPEG
- AVIF: ~50% smaller than JPEG
- Faster page loads, especially on mobile/slower connections

## Prerequisites

- [x] Cloudflare Image Transformations enabled (already configured)
- [x] R2 bucket custom domain configured (raw-images.joeczar.com)
- [x] Worker deployed to production

## Architecture

### Components

- `worker/image-transformer/src/index.ts` - Cloudflare Worker handling image transformations

### Data Flow

```
Browser Request → Worker receives Accept header → detectBestFormat()
  ↓
Parse transforms + format → Fetch from R2 origin with cf.image transforms
  ↓
Cloudflare Image Transformations → Cache at edge → Return to browser
```

### Key Insight

Cloudflare automatically includes the format in the cache key when using `cf.image`, so:
- Chrome with AVIF support: cached as AVIF
- Safari with WebP support: cached as WebP
- Old browsers: cached as JPEG

No risk of serving wrong format from cache.

## Atomic Commits

### Commit 1: Implement browser format detection

**Type:** feat
**Scope:** worker
**Files:**
- `worker/image-transformer/src/index.ts` - Modify

**Changes:**

1. Add `detectBestFormat()` function before `parseTransforms()`:
   ```typescript
   /**
    * Detect best image format based on browser Accept header
    * Priority: AVIF > WebP > JPEG (fallback)
    */
   function detectBestFormat(acceptHeader: string | null): 'avif' | 'webp' | 'jpeg' {
     if (!acceptHeader) return 'jpeg'
     if (acceptHeader.includes('image/avif')) return 'avif'
     if (acceptHeader.includes('image/webp')) return 'webp'
     return 'jpeg'
   }
   ```

2. Update `parseTransforms()` signature (line 157):
   ```typescript
   function parseTransforms(params: URLSearchParams, request: Request): TransformOptions
   ```

3. Update `parseTransforms()` implementation (line 160):
   ```typescript
   const transforms: TransformOptions = {
     quality: DEFAULT_QUALITY,
     format: detectBestFormat(request.headers.get('Accept')),
   }
   ```

4. Update the call to `parseTransforms()` in the fetch handler (line 85):
   ```typescript
   const transforms = parseTransforms(url.searchParams, request)
   ```

5. Update `TransformOptions` interface (line 33):
   ```typescript
   format: 'avif' | 'webp' | 'jpeg'
   ```

6. Update the fetch call type assertion (line 112):
   ```typescript
   format: transforms.format,  // Remove "as 'webp'" cast
   ```

**Acceptance Criteria:**
- [x] `detectBestFormat()` correctly parses Accept headers
- [x] AVIF-capable browsers get `format: 'avif'`
- [x] WebP-capable browsers get `format: 'webp'`
- [x] Fallback browsers get `format: 'jpeg'`
- [x] Type check passes: `cd worker/image-transformer && pnpm type-check`
- [x] No console warnings about 'auto' format

---

### Commit 2: Add console logging for format debugging

**Type:** chore
**Scope:** worker
**Files:**
- `worker/image-transformer/src/index.ts` - Modify

**Changes:**

1. Add logging in `parseTransforms()` after detecting format (after line 160):
   ```typescript
   const transforms: TransformOptions = {
     quality: DEFAULT_QUALITY,
     format: detectBestFormat(request.headers.get('Accept')),
   }

   // Log format selection for debugging (helps verify correct format in production)
   console.log(`[image-transformer] Format selected: ${transforms.format}`)
   ```

**Rationale:** Helps verify in production logs that format detection works correctly across different browsers.

**Acceptance Criteria:**
- [x] Console logs show format selection
- [x] Type check passes: `cd worker/image-transformer && pnpm type-check`

---

## Testing Strategy

### Manual Testing (Required)

Since there are no automated tests for the Worker, manual verification is critical:

1. **Local Testing with wrangler dev:**
   ```bash
   cd worker/image-transformer
   pnpm dev
   # Test with curl to simulate different browsers
   ```

2. **Test different Accept headers:**
   ```bash
   # Chrome (AVIF support)
   curl -H "Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8" \
     http://localhost:8787/test-key.jpg?w=400

   # Safari (WebP support)
   curl -H "Accept: image/webp,image/apng,image/*,*/*;q=0.8" \
     http://localhost:8787/test-key.jpg?w=400

   # Old browser (JPEG fallback)
   curl -H "Accept: image/*,*/*;q=0.8" \
     http://localhost:8787/test-key.jpg?w=400

   # No Accept header (JPEG fallback)
   curl http://localhost:8787/test-key.jpg?w=400
   ```

3. **Verify console output:**
   - Check wrangler dev logs show correct format selection
   - No warnings about 'auto' format

4. **Production deployment testing:**
   ```bash
   pnpm deploy
   # Wait ~30 seconds for deployment
   ```

5. **Real browser testing:**
   - Chrome: Inspect Network tab → check Content-Type is image/avif
   - Safari: Inspect Network tab → check Content-Type is image/webp
   - Firefox: Inspect Network tab → check Content-Type based on support
   - Check file sizes are smaller than before

6. **Cloudflare logs verification:**
   ```bash
   pnpm tail
   # Check logs show format selection for real requests
   ```

### Edge Cases to Test

- No Accept header → defaults to JPEG
- Malformed Accept header → defaults to JPEG
- Accept header with multiple formats → picks best (AVIF > WebP > JPEG)
- Cached images still work (format included in cache key by Cloudflare)

## Verification Checklist

Before deployment:
- [x] Both commits completed and reviewed
- [x] Type check passes (`cd worker/image-transformer && pnpm type-check`)
- [x] Manual curl tests with different Accept headers work
- [x] Local wrangler dev shows correct format selection in logs
- [x] No console warnings about 'auto' format

After production deployment:
- [x] Real browser testing (Chrome/Safari/Firefox)
- [x] Check Network tab shows correct Content-Type headers
- [x] Verify file sizes are smaller (WebP ~30% smaller, AVIF ~50% smaller)
- [x] Check `wrangler tail` logs show format selection
- [x] Test trip page loads faster

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing cached images | Cloudflare auto-includes format in cache key - no risk |
| Format detection fails | Fallback to JPEG (same as current behavior) |
| TypeScript errors in production | Run type-check before deploy |
| Browser doesn't support detected format | Accept header is browser-provided, won't claim support it doesn't have |

## Rollback Plan

If issues occur in production:

1. **Immediate rollback:**
   ```bash
   # Revert to previous deployment
   git revert HEAD~2..HEAD
   cd worker/image-transformer
   pnpm deploy
   ```

2. **Symptoms that would trigger rollback:**
   - Images not loading
   - Console errors in browser
   - Increased error rate in wrangler tail logs
   - Wrong format served (verify via Network tab)

3. **Recovery time:** ~2 minutes (revert + deploy)

## Open Questions

None - implementation is straightforward based on Cloudflare documentation.

## Performance Expectations

**Before:**
- All browsers: JPEG format
- 800px image: ~70KB

**After:**
- Chrome (AVIF): ~35KB (50% reduction)
- Safari (WebP): ~50KB (28% reduction)
- Old browsers (JPEG): ~70KB (no change)

**Network impact on trip page with 20 photos:**
- Chrome: 1.4MB → 700KB (50% savings)
- Safari: 1.4MB → 1MB (28% savings)

## Related Documentation

- [Cloudflare Image Transformations](https://developers.cloudflare.com/images/transform-images/)
- [Worker cf.image options](https://developers.cloudflare.com/workers/runtime-apis/request/#the-cf-property-requestinitcfproperties)
- Issue #206: Image transformer setup (completed)

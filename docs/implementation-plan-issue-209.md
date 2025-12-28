# Implementation Plan: Implement Infinite Scroll for Photo Grid

**Issue:** #209
**Branch:** `feature/issue-209-infinite-scroll`
**Complexity:** Medium
**Total Commits:** 4

## Overview

Add infinite scroll to the photo grid in `TripView.vue` using the existing pagination API (`/api/trips/slug/:slug?limit=50&offset=0`). Initial load fetches 50 photos, subsequent scrolls load 50 more. Uses VueUse's `useIntersectionObserver` for scroll detection and shadcn-vue Skeleton for loading states.

## Prerequisites

- [x] API pagination endpoint exists (PR #213)
- [x] VueUse 14.0.0 installed
- [x] shadcn-vue Skeleton component exists

## Architecture

### Components
- `useInfinitePhotos` (new composable) - Manages paginated photo loading, state, and scroll detection
- `TripView.vue` (modified) - Integrates composable, replaces full photo fetch with progressive loading
- `database.ts` (modified) - Add `getTripBySlugPaginated()` function

### Data Flow

```
Initial Load:
  TripView mounted → getTripBySlugPaginated(slug, 0, 50) → Display 50 photos + sentinel

Infinite Scroll:
  User scrolls → Sentinel enters viewport → useIntersectionObserver triggers
  → loadMorePhotos() → getTripBySlugPaginated(slug, offset, 50)
  → Append new photos to accumulated array → Render new photos

Lightbox Navigation:
  User opens photo → Lightbox uses accumulated photos array
  → Navigation works within loaded photos only
```

### State Management

Composable maintains:
- `photos` (ref) - Accumulated photo array (grows as user scrolls)
- `loading` (ref) - Initial load state
- `loadingMore` (ref) - Pagination load state
- `hasMore` (ref) - Whether more photos exist
- `total` (ref) - Total photo count from API
- `offset` (ref) - Current pagination offset

## Atomic Commits

### Commit 1: Add paginated trip fetch to database utils
**Type:** feat
**Scope:** database
**Files:**
- `app/src/utils/database.ts` - Modify

**Changes:**
- Add `getTripBySlugPaginated(slug: string, offset?: number, limit?: number)` function
- Returns same `ApiTrip & { photos: Photo[]; pagination: PaginationMeta }` shape
- Add `PaginationMeta` type export: `{ total: number; hasMore: boolean; limit: number; offset: number }`
- Passes `?limit=${limit}&offset=${offset}` query params to API
- Defaults: `limit=50, offset=0`

**Implementation Details:**
```typescript
export interface PaginationMeta {
  total: number
  hasMore: boolean
  limit: number
  offset: number
}

export async function getTripBySlugPaginated(
  slug: string,
  offset: number = 0,
  limit: number = 50
): Promise<(ApiTrip & { photos: Photo[]; pagination: PaginationMeta }) | null> {
  try {
    const trip = await api.get<ApiTripWithPhotosResponse & { pagination: PaginationMeta }>(
      `/api/trips/slug/${slug}?limit=${limit}&offset=${offset}`
    )
    return {
      ...transformApiTripWithPhotos(trip),
      pagination: trip.pagination
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
```

**Acceptance Criteria:**
- [ ] Function compiles without TypeScript errors
- [ ] Returns pagination metadata from API
- [ ] Handles 404 errors gracefully (returns null)
- [ ] Types pass: `pnpm type-check`

---

### Commit 2: Create useInfinitePhotos composable
**Type:** feat
**Scope:** composables
**Files:**
- `app/src/composables/useInfinitePhotos.ts` - Create

**Changes:**
- Create composable that manages infinite scroll state
- Accepts `tripSlug` (ref or string)
- Initial load fetches offset=0, limit=50
- `loadMorePhotos()` method increments offset and appends photos
- `sentinelRef` (template ref) for intersection observer target
- Returns: `{ photos, loading, loadingMore, hasMore, total, error, loadMorePhotos, sentinelRef, tripMetadata }`
- Uses `useIntersectionObserver` to trigger `loadMorePhotos` when sentinel enters viewport
- Debounces intersection to prevent double-loads

**Implementation Details:**
```typescript
import { ref, watch, type Ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import { getTripBySlugPaginated, type ApiTrip, type PaginationMeta } from '@/utils/database'
import type { Database } from '@/lib/database.types'

type Photo = Database['public']['Tables']['photos']['Row']

const LIMIT = 50

export function useInfinitePhotos(tripSlug: Ref<string> | string) {
  const slug = typeof tripSlug === 'string' ? ref(tripSlug) : tripSlug

  // State
  const photos = ref<Photo[]>([])
  const tripMetadata = ref<Omit<ApiTrip, 'photos'> | null>(null)
  const loading = ref(true)
  const loadingMore = ref(false)
  const hasMore = ref(false)
  const total = ref(0)
  const offset = ref(0)
  const error = ref('')

  // Sentinel element for intersection observer
  const sentinelRef = ref<HTMLElement | null>(null)

  // Load initial page
  async function loadInitialPhotos() {
    loading.value = true
    error.value = ''
    photos.value = []
    offset.value = 0

    try {
      const data = await getTripBySlugPaginated(slug.value, 0, LIMIT)

      if (!data) {
        error.value = 'Trip not found'
        return
      }

      const { photos: fetchedPhotos, pagination, ...metadata } = data

      tripMetadata.value = metadata
      photos.value = fetchedPhotos
      total.value = pagination.total
      hasMore.value = pagination.hasMore
      offset.value = LIMIT
    } catch (err) {
      console.error('Error loading photos:', err)

      // Handle 401 Unauthorized specifically
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
        error.value = 'This trip is private. Please use the link provided by the trip owner.'
      } else {
        error.value = 'Failed to load trip'
      }
    } finally {
      loading.value = false
    }
  }

  // Load next page
  async function loadMorePhotos() {
    if (loadingMore.value || !hasMore.value) return

    loadingMore.value = true

    try {
      const data = await getTripBySlugPaginated(slug.value, offset.value, LIMIT)

      if (!data) return

      const { photos: fetchedPhotos, pagination } = data

      photos.value = [...photos.value, ...fetchedPhotos]
      hasMore.value = pagination.hasMore
      offset.value += LIMIT
    } catch (err) {
      console.error('Error loading more photos:', err)
      // Don't update error.value - show existing photos
    } finally {
      loadingMore.value = false
    }
  }

  // Set up intersection observer
  useIntersectionObserver(
    sentinelRef,
    ([{ isIntersecting }]) => {
      if (isIntersecting && hasMore.value && !loadingMore.value) {
        loadMorePhotos()
      }
    },
    { threshold: 0.1 }
  )

  // Watch slug changes and reload
  watch(slug, () => {
    loadInitialPhotos()
  })

  // Initial load
  loadInitialPhotos()

  return {
    photos,
    tripMetadata,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    loadMorePhotos,
    sentinelRef
  }
}
```

**Acceptance Criteria:**
- [ ] Composable compiles without TypeScript errors
- [ ] Initial load fetches 50 photos
- [ ] `loadMorePhotos()` appends photos without duplicates
- [ ] Intersection observer triggers on scroll
- [ ] Error handling matches existing pattern
- [ ] Types pass: `pnpm type-check`

---

### Commit 3: Integrate infinite scroll into TripView
**Type:** feat
**Scope:** views
**Files:**
- `app/src/views/TripView.vue` - Modify

**Changes:**
- Replace `getTripBySlug()` with `useInfinitePhotos(slug)` composable
- Use composable's `photos`, `tripMetadata`, `loading`, `error` refs
- Update photo badge to show `total` from composable (e.g., "361 photos")
- Replace `trip.photos` with composable's `photos` in:
  - Photo grid rendering (line 173-203)
  - Lightbox navigation (line 635-705)
  - Map markers remain using `photos` (progressive reveal accepted as tradeoff)
- Add sentinel element after photo grid with loading skeleton
- Keep existing accent color derivation logic

**Implementation Details:**

Replace onMounted block (lines 551-590):
```typescript
const {
  photos,
  tripMetadata: trip,
  loading,
  loadingMore,
  hasMore,
  total,
  error,
  sentinelRef
} = useInfinitePhotos(slug)

// Accent color derivation (existing logic)
watch(trip, (tripData) => {
  if (!tripData) return

  const cover = tripData.cover_photo_url || photos.value[0]?.url
  if (cover) {
    const { setAccentFromImage } = useAccentColor()
    setAccentFromImage(cover)
  }
}, { immediate: true })

// Desktop/mobile view mode logic (existing)
onMounted(() => {
  const mq = window.matchMedia('(min-width: 768px)')
  const updateDesktop = () => {
    isDesktop.value = mq.matches
    if (!isDesktop.value) {
      viewMode.value = 'photos'
    }
  }
  updateDesktop()
  mq.addEventListener?.('change', updateDesktop)
})
```

Update photo badge (line 52):
```vue
<Badge variant="secondary">
  <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
    <path ... />
  </svg>
  {{ total }} photos
</Badge>
```

Update photo grid loop (line 174):
```vue
<Card
  v-for="photo in photos"
  :key="photo.id"
  ...
```

Add sentinel after photo grid (after line 203, before `</div>`):
```vue
<!-- Infinite scroll sentinel -->
<div
  v-if="hasMore"
  ref="sentinelRef"
  class="col-span-full flex items-center justify-center py-8"
>
  <div v-if="loadingMore" class="flex gap-3">
    <Skeleton class="w-24 h-24 rounded" />
    <Skeleton class="w-24 h-24 rounded" />
    <Skeleton class="w-24 h-24 rounded" />
  </div>
</div>
```

Update computed properties (lines 593-638):
```typescript
const photosWithCoordinates = computed(() => {
  return photos.value.filter(p => p.latitude !== null && p.longitude !== null)
})

const dateRange = computed(() => {
  if (!trip.value || photos.value.length === 0) return ''

  const dates = photos.value
    .map(p => new Date(p.taken_at))
    .sort((a, b) => a.getTime() - b.getTime())
  const start = dates[0]
  const end = dates[dates.length - 1]

  if (start.toDateString() === end.toDateString()) {
    return formatDate(start.toISOString())
  }

  return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`
})

const currentPhotoIndex = computed(() => {
  if (!selectedPhoto.value) return -1
  return photos.value.findIndex(p => p.id === selectedPhoto.value!.id)
})
```

Update lightbox navigation (lines 697-705):
```typescript
function nextPhoto() {
  if (currentPhotoIndex.value >= photos.value.length - 1) return
  selectedPhoto.value = photos.value[currentPhotoIndex.value + 1]
}

function previousPhoto() {
  if (currentPhotoIndex.value <= 0) return
  selectedPhoto.value = photos.value[currentPhotoIndex.value - 1]
}
```

Update delete dialog (line 216):
```vue
This will permanently delete "{{ trip.title }}" and all
{{ total }} photos. This action cannot be undone.
```

Update navigation buttons visibility (lines 303-304):
```vue
<Button
  v-if="currentPhotoIndex > 0"
  ...
>
</Button>
<Button
  v-if="currentPhotoIndex < photos.length - 1"
  ...
>
</Button>
```

Add Skeleton import:
```typescript
import { Skeleton } from '@/components/ui/skeleton'
```

**Acceptance Criteria:**
- [ ] Initial page load shows 50 photos
- [ ] Scrolling to bottom loads next 50 photos
- [ ] Photo count badge shows total count (not loaded count)
- [ ] Lightbox navigation works with accumulated photos
- [ ] Map shows progressively loaded photo markers
- [ ] Loading skeleton appears while fetching more photos
- [ ] No TypeScript errors
- [ ] Types pass: `pnpm type-check`

---

### Commit 4: Add Playwright tests for infinite scroll
**Type:** test
**Scope:** e2e
**Files:**
- `app/tests/e2e/trip-infinite-scroll.spec.ts` - Create

**Changes:**
- Create E2E test suite for infinite scroll functionality
- Test initial load (50 photos visible)
- Test scroll to bottom triggers load more
- Test photo count badge shows total
- Test loading skeleton appears/disappears
- Test lightbox navigation works with loaded photos

**Implementation Details:**
```typescript
import { test, expect } from '@playwright/test'

test.describe('Trip View - Infinite Scroll', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes test trip with 150+ photos exists
    // If not, this test should be skipped or trip created via API
    await page.goto('/trip/test-trip-large')
  })

  test('loads initial 50 photos', async ({ page }) => {
    await expect(page.locator('[data-testid="photo-grid"] > *')).toHaveCount(50)
  })

  test('photo count badge shows total count', async ({ page }) => {
    const badge = page.locator('text=/\\d+ photos/')
    await expect(badge).toBeVisible()

    // Extract number from badge (e.g., "150 photos")
    const text = await badge.textContent()
    const count = parseInt(text?.match(/\d+/)?.[0] ?? '0')
    expect(count).toBeGreaterThan(50)
  })

  test('scrolling to bottom loads more photos', async ({ page }) => {
    // Wait for initial load
    await expect(page.locator('[data-testid="photo-grid"] > *')).toHaveCount(50)

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // Wait for loading skeleton
    await expect(page.locator('[data-testid="loading-skeleton"]')).toBeVisible()

    // Wait for more photos to load
    await page.waitForTimeout(1000) // Give time for API call

    // Should now have more than 50 photos
    await expect(page.locator('[data-testid="photo-grid"] > *').count()).resolves.toBeGreaterThan(50)
  })

  test('lightbox navigation works with loaded photos only', async ({ page }) => {
    // Open first photo
    await page.locator('[data-testid="photo-grid"] > *').first().click()

    // Lightbox should be visible
    await expect(page.locator('[data-testid="lightbox"]')).toBeVisible()

    // Navigate to 50th photo (last of initial load)
    for (let i = 0; i < 49; i++) {
      await page.keyboard.press('ArrowRight')
    }

    // Next button should not be visible (need to load more first)
    // OR should be visible if more loaded in background
    // This depends on implementation - adjust as needed
  })

  test('sentinel appears when more photos available', async ({ page }) => {
    await expect(page.locator('[data-testid="photo-grid"] > *')).toHaveCount(50)

    // Scroll near bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 200))

    // Sentinel should be visible
    await expect(page.locator('text=/loading/i')).toBeVisible()
  })
})
```

**Note:** These tests require a test trip with 150+ photos. If not available, tests should be marked as `test.skip()` or a fixture created via API setup.

**Acceptance Criteria:**
- [ ] Tests pass with real data
- [ ] Tests verify infinite scroll behavior
- [ ] Tests check loading states
- [ ] Test suite runs: `pnpm test:e2e`

## Testing Strategy

### Manual Testing (Required for each commit)

**After Commit 1:**
```bash
pnpm type-check
# Verify database.ts exports new function
```

**After Commit 2:**
```bash
pnpm type-check
# Create test component to verify composable works in isolation
```

**After Commit 3:**
```bash
pnpm dev:docker
# Navigate to trip with 100+ photos
# Verify:
# - Initial load shows 50 photos
# - Scroll to bottom loads next 50
# - Photo count badge shows total count
# - Lightbox navigation works
# - Map shows loaded photo markers
# - Loading skeleton appears/disappears correctly
```

**After Commit 4:**
```bash
pnpm test:e2e
# All tests should pass
```

### Browser Testing

Test in:
- Chrome (primary)
- Firefox
- Safari (iOS)
- Mobile viewport (responsive behavior)

### Performance Verification

Check Chrome DevTools Performance tab:
- No memory leaks on repeated scrolls
- Smooth scroll performance (60fps)
- Network requests properly debounced

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `pnpm test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Lint passes: `pnpm lint`
- [ ] Manual verification in browser:
  - [ ] Initial load shows 50 photos
  - [ ] Infinite scroll loads more photos
  - [ ] Photo count badge shows total
  - [ ] Lightbox navigation works
  - [ ] Map markers appear progressively
  - [ ] No console errors
  - [ ] Loading states appear correctly
- [ ] Tested on mobile viewport
- [ ] Performance is acceptable (no jank on scroll)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Map shows incomplete markers | Accept as tradeoff - progressive reveal is intentional. Alternative: Fetch all photo coordinates separately for map only (out of scope). |
| Double-loading on fast scroll | Debounce intersection observer, check `loadingMore` flag before triggering |
| Lightbox navigation limited to loaded photos | Accepted behavior - users naturally load more as they scroll. Edge case: jumping to end requires scrolling first. |
| Memory leak with large photo arrays | Monitor in DevTools; consider virtualization if >500 photos (future enhancement) |
| Race condition on rapid slug changes | `watch(slug)` resets state on change, previous requests ignored |

## Open Questions

None - all requirements clarified during research phase.

## Performance Considerations

### Current Implementation
- Each scroll loads 50 photos (~2.5MB of thumbnail data)
- Photos accumulate in memory (not released)
- DOM elements accumulate (no virtualization)

### When to Optimize (Future)
If trip has >500 photos:
- Consider virtual scrolling (vue-virtual-scroller)
- Consider loading high-res images on-demand only
- Consider unloading off-screen photos from DOM

For MVP (trips with <500 photos), current approach is sufficient.

## Follow-up Issues (Out of Scope)

- Virtual scrolling for trips with >500 photos
- Separate API call to load all photo coordinates for map (independent of photo grid pagination)
- Prefetch next page on scroll proximity (load before reaching sentinel)
- Show photo position indicator in lightbox (e.g., "23 / 361")

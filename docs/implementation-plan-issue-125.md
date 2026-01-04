# Implementation Plan: Issue #125 - Darkroom View with Rotation Controls

**Issue:** #125
**Branch:** `feature/issue-125-darkroom-view`
**Complexity:** Medium
**Total Commits:** 7
**Estimated Lines:** ~400

## Overview

Create a darkroom view for photo rotation management. Admin users can access this view from Trip Management to rotate photos using visual controls and keyboard shortcuts. The view features a contact sheet (grid of all photos) and a detail panel showing the selected photo with rotation controls. Changes auto-save after 500ms debounce.

## Prerequisites

- [x] PATCH `/api/trips/photos/:id` rotation endpoint exists (issue #123)
- [x] `getImageUrl(url, { rotation })` utility supports rotation param
- [x] `getTripById(tripId)` fetches trip with all photos
- [x] AdminLayout component for admin navigation
- [x] shadcn-vue Button, Card, Sheet components available

## Architecture

### Components
- `DarkroomView.vue` - Main view with contact sheet and detail panel
- Uses existing `AdminLayout.vue` for navigation
- Uses existing `getImageUrl()` utility for CDN rotation params

### Data Flow
```
User clicks rotate →
  Optimistic UI update (local state) →
  Debounced API call (500ms) →
  PATCH /api/trips/photos/:id { rotation } →
  CDN URL rebuilt with ?r=90 param →
  Photo re-renders with new rotation
```

### Route
- Path: `/admin/darkroom/:tripId`
- Auth: `requiresAuth: true, requiresAdmin: true`
- Lazy loaded like other admin views

## Atomic Commits

### Commit 1: Add darkroom route and basic view structure
**Type:** feat
**Scope:** router
**Files:**
- `app/src/router/index.ts` - Add darkroom route
- `app/src/views/admin/DarkroomView.vue` - Create basic view skeleton

**Changes:**
- Add route definition at line ~88 (after admin-access, before trip):
  ```ts
  {
    path: '/admin/darkroom/:tripId',
    name: 'admin-darkroom',
    component: () => import('../views/admin/DarkroomView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  }
  ```
- Create `DarkroomView.vue` with:
  - AdminLayout wrapper
  - Basic header with trip title
  - Loading/error states for trip data
  - Fetch trip by ID using `getTripById(tripId)`
  - Empty main content area (placeholder)

**Acceptance Criteria:**
- [ ] Route accessible at `/admin/darkroom/:tripId`
- [ ] Auth guard redirects non-admin users
- [ ] View loads trip data successfully
- [ ] Loading/error states display correctly
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 2: Implement contact sheet (photo grid)
**Type:** feat
**Scope:** darkroom
**Files:**
- `app/src/views/admin/DarkroomView.vue` - Add contact sheet grid

**Changes:**
- Add contact sheet section below header:
  ```vue
  <!-- Contact Sheet -->
  <div class="contact-sheet">
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      <button
        v-for="photo in photos"
        :key="photo.id"
        @click="selectPhoto(photo.id)"
        :class="selected === photo.id ? 'ring-2 ring-primary' : ''"
      >
        <img :src="getImageUrl(photo.thumbnail_url, { rotation: photo.rotation })" />
      </button>
    </div>
  </div>
  ```
- Add reactive state:
  - `selectedPhotoId: string | null = null`
  - `photos: Photo[]` from trip data
- Add `selectPhoto(photoId)` method to update selection
- Use existing responsive grid pattern from TripView
- Display thumbnails with current rotation applied

**Acceptance Criteria:**
- [ ] Grid displays all photos in trip
- [ ] Grid is responsive (2-6 columns)
- [ ] Clicking photo selects it (visual indicator)
- [ ] Thumbnails show current rotation
- [ ] Dark mode compatible
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 3: Add detail panel with photo display
**Type:** feat
**Scope:** darkroom
**Files:**
- `app/src/views/admin/DarkroomView.vue` - Add detail panel

**Changes:**
- Add detail panel below contact sheet:
  ```vue
  <!-- Detail Panel -->
  <div v-if="selectedPhoto" class="detail-panel mt-6">
    <Card class="p-6">
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- Photo Display -->
        <div class="flex-1 flex items-center justify-center bg-muted rounded-lg min-h-[400px]">
          <img
            :src="getImageUrl(selectedPhoto.url, { rotation: localRotations[selectedPhoto.id] ?? selectedPhoto.rotation })"
            :alt="`Photo from ${trip.title}`"
            class="max-w-full max-h-[600px] object-contain"
          />
        </div>
        <!-- Controls (placeholder for next commit) -->
        <div class="lg:w-64">
          <!-- Rotation controls will go here -->
        </div>
      </div>
    </Card>
  </div>
  ```
- Add computed property:
  - `selectedPhoto` - finds photo by `selectedPhotoId`
- Add reactive state:
  - `localRotations: Record<string, number>` - tracks optimistic rotation updates
- Display photo at larger size with current rotation
- Use Card component for styling
- Responsive layout (column on mobile, row on desktop)

**Acceptance Criteria:**
- [ ] Detail panel shows when photo selected
- [ ] Photo displays at appropriate size
- [ ] Photo shows current rotation
- [ ] Layout responsive (mobile/desktop)
- [ ] Dark mode compatible
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 4: Add rotation control buttons
**Type:** feat
**Scope:** darkroom
**Files:**
- `app/src/views/admin/DarkroomView.vue` - Add rotation buttons and logic

**Changes:**
- Add rotation control buttons in detail panel sidebar:
  ```vue
  <div class="space-y-4">
    <h3 class="font-semibold text-lg">Rotation</h3>
    <div class="flex gap-2">
      <Button
        @click="rotatePhoto(-90)"
        variant="outline"
        class="flex-1"
      >
        <RotateCcw class="w-4 h-4 mr-2" />
        CCW
      </Button>
      <Button
        @click="rotatePhoto(90)"
        variant="outline"
        class="flex-1"
      >
        <RotateCw class="w-4 h-4 mr-2" />
        CW
      </Button>
    </div>
    <div class="text-sm text-muted-foreground text-center">
      {{ localRotations[selectedPhoto.id] ?? selectedPhoto.rotation }}°
    </div>
  </div>
  ```
- Add rotation icons (lucide-vue-next):
  - `import { RotateCw, RotateCcw } from 'lucide-vue-next'`
- Add `rotatePhoto(delta: number)` method:
  - Calculate new rotation: `(current + delta + 360) % 360`
  - Normalize to valid values: 0, 90, 180, 270
  - Update `localRotations[photoId]` for optimistic UI
  - Call API update function (placeholder for now)
- Display current rotation value

**Acceptance Criteria:**
- [ ] Buttons display correctly
- [ ] Clicking rotates photo immediately (optimistic)
- [ ] Rotation normalizes to 0, 90, 180, 270
- [ ] Current rotation value displayed
- [ ] Dark mode compatible
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 5: Implement auto-save with debouncing
**Type:** feat
**Scope:** darkroom
**Files:**
- `app/src/views/admin/DarkroomView.vue` - Add auto-save logic
- `app/src/utils/database.ts` - Add updatePhotoRotation function

**Changes:**

**database.ts:**
- Add function at end of file:
  ```ts
  /**
   * Update photo rotation (admin-only)
   */
  export async function updatePhotoRotation(photoId: string, rotation: number): Promise<void> {
    const { getToken } = useAuth()
    requireAuth(getToken)

    await api.patch(`/api/trips/photos/${photoId}`, { rotation })
  }
  ```

**DarkroomView.vue:**
- Add debounce state:
  ```ts
  const saveTimeouts = ref<Record<string, number>>({})
  const savingPhotos = ref<Set<string>>(new Set())
  ```
- Update `rotatePhoto()` to debounce saves:
  ```ts
  async function rotatePhoto(delta: number) {
    if (!selectedPhotoId.value) return

    const photoId = selectedPhotoId.value
    const current = localRotations.value[photoId] ?? selectedPhoto.value.rotation
    const newRotation = ((current + delta + 360) % 360) as 0 | 90 | 180 | 270

    // Optimistic update
    localRotations.value[photoId] = newRotation

    // Clear existing timeout
    if (saveTimeouts.value[photoId]) {
      clearTimeout(saveTimeouts.value[photoId])
    }

    // Debounce save
    saveTimeouts.value[photoId] = setTimeout(async () => {
      savingPhotos.value.add(photoId)
      try {
        await updatePhotoRotation(photoId, newRotation)
        // Update photo in local array
        const photo = photos.value.find(p => p.id === photoId)
        if (photo) photo.rotation = newRotation
      } catch (error) {
        console.error('Failed to save rotation:', error)
        // Revert optimistic update
        delete localRotations.value[photoId]
      } finally {
        savingPhotos.value.delete(photoId)
      }
    }, 500)
  }
  ```
- Add saving indicator in UI (subtle spinner/dot when saving)
- Clean up timeouts on unmount

**Acceptance Criteria:**
- [ ] Rotation saves after 500ms of no changes
- [ ] Multiple rapid rotations only trigger one save
- [ ] Saving indicator displays during save
- [ ] Failed saves revert optimistic update
- [ ] Successful saves update local photo array
- [ ] Timeouts cleared on component unmount
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 6: Add keyboard shortcuts
**Type:** feat
**Scope:** darkroom
**Files:**
- `app/src/views/admin/DarkroomView.vue` - Add keyboard event handlers

**Changes:**
- Add keyboard event listener:
  ```ts
  onMounted(() => {
    window.addEventListener('keydown', handleKeyboard)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyboard)
    // Clean up pending saves
    Object.values(saveTimeouts.value).forEach(clearTimeout)
  })

  function handleKeyboard(e: KeyboardEvent) {
    if (!selectedPhotoId.value) return

    // Ignore if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      const delta = e.shiftKey ? -90 : 90
      rotatePhoto(delta)
    }

    // Arrow navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      navigatePhoto(e.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  function navigatePhoto(direction: number) {
    if (!selectedPhotoId.value || photos.value.length === 0) return

    const currentIndex = photos.value.findIndex(p => p.id === selectedPhotoId.value)
    if (currentIndex === -1) return

    const nextIndex = (currentIndex + direction + photos.value.length) % photos.value.length
    selectedPhotoId.value = photos.value[nextIndex].id
  }
  ```
- Add keyboard shortcuts help text in UI:
  ```vue
  <div class="text-xs text-muted-foreground mt-4 space-y-1">
    <p><kbd>R</kbd> - Rotate CW</p>
    <p><kbd>Shift+R</kbd> - Rotate CCW</p>
    <p><kbd>←/→</kbd> - Navigate photos</p>
  </div>
  ```

**Acceptance Criteria:**
- [ ] `R` rotates clockwise
- [ ] `Shift+R` rotates counter-clockwise
- [ ] Arrow keys navigate between photos
- [ ] Shortcuts disabled when typing in inputs
- [ ] Help text displays keyboard shortcuts
- [ ] Event listeners cleaned up on unmount
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 7: Add darkroom link to Trip Management
**Type:** feat
**Scope:** trip-management
**Files:**
- `app/src/components/TripCard.vue` - Add darkroom button for admins

**Changes:**
- Add darkroom button next to edit/delete buttons (lines ~92-104):
  ```vue
  <Button
    v-if="userRole && ['admin', 'editor'].includes(userRole)"
    variant="ghost"
    size="icon"
    class="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
    @click.prevent.stop="navigateToDarkroom"
    title="Open in darkroom"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z" clip-rule="evenodd" />
    </svg>
  </Button>
  ```
- Add `navigateToDarkroom()` method:
  ```ts
  function navigateToDarkroom() {
    router.push(`/admin/darkroom/${props.trip.id}`)
  }
  ```
- Position button between edit and delete buttons
- Use film/grid icon to represent darkroom
- Add tooltip "Open in darkroom"

**Acceptance Criteria:**
- [ ] Darkroom button displays for admin/editor
- [ ] Button navigates to darkroom view with correct trip ID
- [ ] Button styled consistently with edit/delete
- [ ] Tooltip displays on hover
- [ ] Click doesn't trigger card navigation
- [ ] Dark mode compatible
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

## Testing Strategy

Tests should be included in relevant commits:

### Manual Testing (via Playwright)
- **After Commit 1:** Navigate to `/admin/darkroom/{tripId}`, verify loading states
- **After Commit 2:** Click photos in grid, verify selection visual
- **After Commit 3:** Verify detail panel shows selected photo
- **After Commit 4:** Click rotation buttons, verify immediate visual update
- **After Commit 5:** Rotate photo multiple times rapidly, verify only one save after 500ms
- **After Commit 6:** Test keyboard shortcuts (R, Shift+R, arrows)
- **After Commit 7:** Click darkroom button from Trip Management, verify navigation

### Dark Mode Testing
- Test all commits in both light and dark mode
- Verify contrast and readability of controls
- Check selected photo ring visibility

### Responsive Testing
- Mobile: Contact sheet grid adjusts to 2 columns
- Tablet: Grid shows 3-4 columns
- Desktop: Grid shows 6 columns, detail panel side-by-side layout

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Manual testing in browser (light + dark mode)
- [ ] Responsive testing (mobile, tablet, desktop)
- [ ] Keyboard shortcuts functional
- [ ] Auto-save works correctly (debouncing verified)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Navigation from Trip Management works
- [ ] Auth guards prevent non-admin access

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Rapid rotation clicks cause race conditions | Use debouncing (500ms) and optimistic updates with rollback on error |
| Large photos slow down detail view | Use max-height constraint (600px) and object-contain |
| Keyboard shortcuts conflict with browser | Prevent default on handled keys, ignore when typing in inputs |
| Memory leak from timeout cleanup | Clear all timeouts in onUnmounted hook |
| CDN caching doesn't reflect new rotation | Rotation is URL param (?r=90), CDN serves different cached version per param |

## Open Questions

None - all requirements are clear from issue specification.

## Implementation Notes

### Why separate local and persisted rotation?
- `localRotations` provides optimistic UI updates (instant feedback)
- `photo.rotation` is source of truth from database
- On save success, update `photo.rotation` to match `localRotations`
- On save failure, remove from `localRotations` to revert

### Why 500ms debounce?
- Balance between UX (not waiting too long) and API efficiency (not spamming requests)
- Allows rapid rotations (R R R R) to only trigger one save
- Standard debounce duration for auto-save features

### Grid layout pattern
- Matches existing photo grid in TripView
- `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6`
- Consistent with app's responsive design system

### Keyboard shortcuts rationale
- `R` (rotate clockwise) - mnemonic "Rotate"
- `Shift+R` (rotate counter-clockwise) - standard modifier for reverse action
- `←/→` (navigate) - standard photo viewer navigation
- Check for input focus to avoid conflicts when user typing

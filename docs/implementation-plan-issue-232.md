# Implementation Plan: Rotation Changes from Darkroom Don't Display in TripView (Dev Mode)

**Issue:** #232
**Branch:** `feature/issue-232-tripview-rotation`
**Complexity:** Simple
**Total Commits:** 2

## Overview

When photos are rotated in the Darkroom view, the rotation is saved to the database but doesn't display correctly in TripView during development. The API route ignores rotation params in dev mode (no CDN), while Darkroom works because it uses CSS rotation as an instant visual fallback. We'll add the same CSS rotation strategy to TripView's three photo display locations.

## Prerequisites

- [x] API route already processes rotation params (commit 26ecdc3)
- [x] DarkroomView pattern established (dual CSS + API strategy)
- [x] `getImageUrl()` helper passes rotation params

## Architecture

### Components

- `TripView.vue` - Main trip display with map markers, photo grid, and lightbox

### Data Flow

```
Photo with rotation → getImageUrl(url, { rotation }) → API query param
                   ↓
              CSS transform (instant visual feedback)
```

**Dual Strategy:**
1. **CSS rotation** - Instant visual feedback (client-side transform)
2. **API rotation param** - Server-processed image (Sharp transform)

This matches DarkroomView's approach where CSS provides immediate feedback while API processes the final image.

## Atomic Commits

### Commit 1: Add CSS rotation to map markers and popup

**Type:** fix
**Scope:** tripview
**Files:**
- `app/src/views/TripView.vue` - Modify lines 129-136 (map marker) and 142-149 (popup)

**Changes:**

**1. Map marker image (line 129-136):**
```vue
<img
  :src="getImageUrl(photo.thumbnail_url, { width: 80, rotation: photo.rotation })"
  :alt="photo.caption || 'Photo'"
  class="w-full h-full object-cover"
  :style="{ transform: `rotate(${photo.rotation}deg)` }"
/>
```

**2. Map popup ProgressiveImage (line 142-149):**

Since ProgressiveImage doesn't support `:style` directly, wrap in a div:
```vue
<div :style="{ transform: `rotate(${photo.rotation}deg)` }">
  <ProgressiveImage
    :src="popupFallback(photo)"
    :srcset="popupSrcset(photo)"
    sizes="300px"
    :alt="photo.caption || 'Photo'"
    wrapper-class="w-full h-48 rounded mb-2"
    class="w-full h-48 object-cover rounded"
  />
</div>
```

**Acceptance Criteria:**
- [ ] Map marker thumbnails display with correct rotation
- [ ] Map popup photos display with correct rotation
- [ ] Rotation is instant (no flash/delay)
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

**Manual Verification:**
1. Start dev server: `pnpm dev:docker`
2. Navigate to Darkroom, rotate a photo 90°
3. Return to TripView
4. Verify map marker shows rotated thumbnail
5. Click marker, verify popup shows rotated photo

---

### Commit 2: Add CSS rotation to photo grid and lightbox

**Type:** fix
**Scope:** tripview
**Files:**
- `app/src/views/TripView.vue` - Modify lines 181-188 (photo grid) and 280-288 (lightbox)

**Changes:**

**1. Photo grid ProgressiveImage (line 181-188):**

Wrap ProgressiveImage in a div with rotation:
```vue
<Card
  v-for="photo in photos"
  :key="photo.id"
  class="relative aspect-square cursor-pointer overflow-hidden group hover:ring-2 hover:ring-primary transition-all"
  :class="selectedPhoto?.id === photo.id ? 'ring-2 ring-primary' : ''"
  @click="selectPhoto(photo)"
>
  <div :style="{ transform: `rotate(${photo.rotation}deg)` }" class="w-full h-full">
    <ProgressiveImage
      :src="gridFallback(photo)"
      :srcset="gridSrcset(photo)"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
      :alt="photo.caption || 'Photo'"
      wrapper-class="w-full h-full"
      class="w-full h-full object-cover"
    />
  </div>
  <!-- Warning icon for no location remains unchanged -->
</Card>
```

**2. Lightbox image (line 280-288):**

Add rotation to existing style object:
```vue
<img
  :src="lightboxFallback(selectedPhoto)"
  :srcset="lightboxSrcset(selectedPhoto)"
  sizes="100vw"
  decoding="async"
  :alt="selectedPhoto.caption || 'Photo'"
  class="w-full h-auto block"
  draggable="false"
  :style="{ transform: `rotate(${selectedPhoto.rotation}deg)` }"
/>
```

**Acceptance Criteria:**
- [ ] Photo grid displays all photos with correct rotation
- [ ] Lightbox displays photos with correct rotation
- [ ] 90°/270° rotations don't break aspect-ratio layout
- [ ] Rotation persists when navigating between photos in lightbox
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

**Manual Verification:**
1. Navigate to TripView with rotated photos
2. Verify photo grid displays all rotations correctly
3. Click a rotated photo
4. Verify lightbox displays correct rotation
5. Use arrow keys/buttons to navigate to other photos
6. Verify rotation updates correctly for each photo

**Layout Considerations:**
- 90°/270° rotations will change aspect ratio within fixed grid squares
- `overflow-hidden` on Card parent prevents overflow
- `object-cover` may crop edges of rotated images (expected behavior)

---

## Testing Strategy

No new tests required - this is a visual fix. Testing through manual verification:

1. **Rotation persistence:** Rotate photo in Darkroom → View in TripView
2. **All display contexts:** Map marker, map popup, photo grid, lightbox
3. **Edge cases:**
   - 0° (no rotation)
   - 90° (portrait → landscape)
   - 180° (upside down)
   - 270° (landscape → portrait)
4. **Responsive behavior:** Test on mobile and desktop
5. **Dark mode:** Verify rotation works in both themes

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Manual verification in browser (all 4 display contexts)
- [ ] Test all rotation values (0°, 90°, 180°, 270°)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Test suite passes (`pnpm test`)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| ProgressiveImage doesn't support `:style` prop | Wrap in div with rotation, ProgressiveImage remains unchanged |
| Double rotation (CSS + API both apply) | Intentional - CSS is instant, API replaces on load with same rotation |
| 90°/270° rotations break grid layout | `overflow-hidden` on parent Card prevents overflow |
| Aspect ratio issues in fixed-size containers | `object-cover` handles cropping, expected behavior |

## Open Questions

None - implementation approach is clear based on existing DarkroomView pattern.

## Related Work

- **PR #231:** DarkroomView implementation with CSS rotation pattern
- **Issue #125:** Original Darkroom feature request
- **Commit 26ecdc3:** API rotation support added to photo serving endpoint

## Notes

- **Why CSS rotation?** In dev mode, the API rotation param works but may have caching issues. CSS provides instant visual feedback that matches the database state.
- **Why not remove CSS after API loads?** The API response already has rotation applied (Sharp transform), so CSS rotation on top creates correct appearance. This is the same pattern used successfully in DarkroomView.
- **Frontend-only fix:** No schema, API, or backend changes needed.

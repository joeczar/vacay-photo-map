# Admin Spaces Design

> The admin area is a craftsman's workspace — three distinct rooms for different modes of work.

---

## The Three Spaces

| Space | Purpose | Aesthetic | Accent |
|-------|---------|-----------|--------|
| **Gallery** | View your collection, manage trips | Photographer's studio — cool, clean, neutral | Violet `#a78bfa` |
| **Darkroom** | Process photos — rotate, crop, review | Darkroom — warm red glow, contact sheets | Red `#ff6b6b` / Amber `#f59e0b` |
| **Workshop** | Design trips — descriptions, sections, themes | Woodworker's bench — warm wood, blueprints | Brass `#d4a84b` |

### Design Direction

**Clean Minimal** — the three spaces share bones but differ in atmosphere:

- **Shared:** Typography (Space Grotesk), component shapes, button styles
- **Distinct:** Background color temperature, accent colors, subtle textures

See `docs/design-exploration/darkroom-workshop-moods.html` for the mood reference.
See `docs/design-exploration/three-variations-comparison.html` for alternative directions (Analog Craft, Maximalist).

---

## Current State

Upload → Publish. Photos go on a map. That's it.

---

## MVP Features

### Darkroom

| Feature | Priority | Approach | Notes |
|---------|----------|----------|-------|
| **Rotate photos** | MVP | Metadata + CSS transform | Store rotation (0, 90, 180, 270), apply via CSS. No re-processing needed. |
| Crop photos | Post-MVP | Sharp server-side | Requires image re-processing and new file storage |
| Batch select/delete | Post-MVP | UI only | |
| EXIF viewer | Post-MVP | Display existing data | Already extracted on upload |

### Workshop

| Feature | Priority | Approach | Notes |
|---------|----------|----------|-------|
| **Photo descriptions** | MVP | Text field per photo | The story, the voice — essential for "gift" feel |
| **Sections/chapters** | MVP | Group photos by location/time | Manual override of auto-grouping |
| Presentation styles | Post-MVP | Postcard, polaroid, plain | Per-photo or per-section setting |
| Color schemes | Post-MVP | Palette per section/chapter | Ties to terrain/location |
| Animated playthrough | Future | Vehicle travels between points | "Passenger Princess" mode from vision doc |

---

## Data Model Changes

### Photo (additions)

```typescript
interface Photo {
  // existing fields...

  // Darkroom
  rotation?: 0 | 90 | 180 | 270;  // CSS transform rotation

  // Workshop
  description?: string;           // Caption/story
  sectionId?: string;             // FK to section
  presentationStyle?: 'plain' | 'postcard' | 'polaroid';
}
```

### Section (new)

```typescript
interface Section {
  id: string;
  tripId: string;
  title: string;
  order: number;
  colorScheme?: string;           // Future: palette key
}
```

---

## UI Flow

### Gallery → Darkroom

1. User clicks trip card in Gallery
2. Enters Darkroom view with contact sheet of photos
3. Select photos → rotate, review, delete
4. "Continue to Workshop" when done processing

### Darkroom → Workshop

1. Photos are processed, ready for design
2. Workshop shows photos with description fields
3. Drag to reorder, group into sections
4. Preview trip as recipient would see it
5. Publish when ready

---

## Future Features (from Vision Doc)

- **Photo treatments:** Postcard with stamp/postmark, polaroid frame
- **Theming system:** Palette, typography, map style, transport icon per trip
- **Passenger Princess mode:** Cinematic animated playthrough
- **Chapters:** Auto-group by GPS clusters, manual refinement
- **Gift metaphor:** Envelope/unwrapping animation for recipients

See `docs/VISION_LIVING_PHOTOBOOK.md` for full vision.

---

## Open Questions

1. **Section auto-detection:** Cluster by GPS proximity? Time gaps? Both?
2. **Rotation persistence:** CSS-only display, or generate rotated file for download/sharing?
3. **Presentation styles:** Per-photo or per-section? Both?

---

*Created: December 2024*
*Based on design workshopping session*

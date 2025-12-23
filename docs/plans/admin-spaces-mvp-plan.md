# Implementation Plan: Admin Spaces MVP

**Issues:** #117 (rotation), #118 (descriptions), #119 (sections)
**Complexity:** Medium
**Total PRs:** 12 (all under 500 lines)

## Overview

Build the Admin Spaces MVP across three feature areas:
1. **Darkroom** - Photo rotation (metadata + CSS transform)
2. **Workshop** - Photo descriptions (text per photo)
3. **Workshop** - Trip sections/chapters (structured organization)

Each PR is independently mergeable, under 500 lines, and adds incremental value.

## Prerequisites

- [ ] Current schema has photos table with: id, trip_id, url, thumbnail_url, latitude, longitude, taken_at, caption, album
- [ ] API uses Hono + Postgres.js with full CRUD for trips/photos
- [ ] Frontend uses shadcn-vue (New York style, Slate)

## Architectural Decisions

### Photo Rotation Strategy
- Store rotation value (0, 90, 180, 270) as integer in database
- Apply rotation via CSS transform on frontend
- No server-side image reprocessing (future enhancement)
- Rotation persists across all views (grid, lightbox, map popup)

### Photo Descriptions Strategy
- Store description as nullable text field
- Separate from existing caption field (caption = EXIF data, description = user story)
- Display in lightbox below photo, optionally in grid view
- Workshop provides inline editing interface

### Trip Sections Strategy
- New sections table with: id, trip_id, title, order_index
- Photos get section_id foreign key (nullable - photos can be unsectioned)
- Section order determines display sequence
- Manual section management in Workshop (auto-detection is future)

## PR Sequence

PRs are ordered by dependency. Parallel work indicated with (P).

---

## Phase 1: Database Schema (PRs 1-2)

### PR #1: Database schema - Add photo rotation field

**Branch:** `feature/issue-117-photo-rotation-schema`
**Type:** feat
**Scope:** database
**Estimated Lines:** ~50

**Files:**
- `api/src/db/schema.sql` - Add rotation column
- `api/src/db/migrations/005_add_photo_rotation.sql` - Migration script (create)

**Changes:**
- Add `rotation` INTEGER DEFAULT 0 NOT NULL to photos table
- Add CHECK constraint ensuring rotation IN (0, 90, 180, 270)
- Create migration script with idempotent SQL
- Update schema comments documenting rotation values

**Acceptance Criteria:**
- [ ] Schema updated with rotation field
- [ ] Migration script runs successfully
- [ ] Database reflects changes after migration
- [ ] Default value 0 applies to existing photos
- [ ] CHECK constraint prevents invalid rotation values

**Dependencies:** None

---

### PR #2: Database schema - Add photo descriptions and sections

**Branch:** `feature/issue-118-119-description-sections-schema`
**Type:** feat
**Scope:** database
**Estimated Lines:** ~120

**Files:**
- `api/src/db/schema.sql` - Add description column, create sections table
- `api/src/db/migrations/006_add_descriptions_sections.sql` - Migration script (create)

**Changes:**
- Add `description` TEXT NULL to photos table
- Create `sections` table:
  - id UUID PRIMARY KEY
  - trip_id UUID REFERENCES trips(id) ON DELETE CASCADE
  - title TEXT NOT NULL
  - order_index INTEGER NOT NULL
  - created_at TIMESTAMPTZ DEFAULT NOW()
  - updated_at TIMESTAMPTZ DEFAULT NOW()
- Add `section_id` UUID NULL REFERENCES sections(id) ON DELETE SET NULL to photos table
- Create index on sections(trip_id)
- Create index on sections(trip_id, order_index)
- Create index on photos(section_id)
- Add updated_at trigger for sections table
- Migration script with idempotent SQL

**Acceptance Criteria:**
- [ ] Schema updated with description and section_id fields on photos
- [ ] Sections table created with all fields
- [ ] Indexes created for performance
- [ ] Migration runs successfully
- [ ] Foreign key constraints work correctly
- [ ] Photos.section_id SET NULL on section deletion

**Dependencies:** None (can run parallel with PR #1)

---

## Phase 2: API Types & Responses (PR 3)

### PR #3: API types - Update TypeScript interfaces for new fields

**Branch:** `feature/api-types-rotation-description-sections`
**Type:** feat
**Scope:** api
**Estimated Lines:** ~150

**Files:**
- `api/src/routes/trips.ts` - Update DbPhoto interface, PhotoResponse interface
- `app/src/lib/database.types.ts` - Update generated types

**Changes:**
- Update `DbPhoto` interface to include: rotation, description, section_id
- Update `PhotoResponse` interface to include: rotation, description, sectionId
- Update `toPhotoResponse()` transform function to map new fields
- Update photo queries to SELECT new fields
- Update photo INSERT statements to accept new fields
- No validation logic yet - just type support

**Acceptance Criteria:**
- [ ] TypeScript compiles without errors
- [ ] All photo queries return new fields
- [ ] Photo creation accepts new optional fields
- [ ] Response transforms include new fields with correct types
- [ ] Type check passes: `pnpm type-check`

**Dependencies:** PR #1, PR #2 (schema must exist)

---

## Phase 3: Rotation API (PR 4)

### PR #4: API endpoint - PATCH /api/trips/photos/:id rotation

**Branch:** `feature/issue-117-rotation-api`
**Type:** feat
**Scope:** api
**Estimated Lines:** ~80

**Files:**
- `api/src/routes/trips.ts` - Add new PATCH endpoint

**Changes:**
- New endpoint: `PATCH /api/trips/photos/:id` (admin only)
- Request body accepts: `{ rotation?: 0 | 90 | 180 | 270, description?: string | null, sectionId?: string | null }`
- Validate rotation values (must be 0, 90, 180, or 270)
- Validate UUID format for photoId and sectionId
- Update only provided fields (dynamic PATCH pattern matching existing trip PATCH)
- Return updated PhotoResponse
- Error handling for not found, invalid values, auth

**Acceptance Criteria:**
- [ ] Endpoint updates photo rotation
- [ ] Validates rotation values correctly
- [ ] Returns 400 for invalid rotation
- [ ] Returns 404 for non-existent photo
- [ ] Returns 403 for non-admin users
- [ ] Test passes: `bun test` (add test file)
- [ ] Type check passes

**Dependencies:** PR #3

---

## Phase 4: Sections API (PRs 5-6)

### PR #5: API endpoints - Section CRUD operations

**Branch:** `feature/issue-119-sections-api-crud`
**Type:** feat
**Scope:** api
**Estimated Lines:** ~350

**Files:**
- `api/src/routes/sections.ts` - New router file (create)
- `api/src/index.ts` - Mount sections router
- `api/src/types/sections.ts` - Types (create)

**Changes:**
- Create new Hono router for sections
- Types: DbSection, SectionResponse, transform function
- `GET /api/trips/:tripId/sections` - List sections for trip, ordered by order_index
- `POST /api/trips/:tripId/sections` - Create section (admin only)
  - Request: `{ title: string, orderIndex?: number }`
  - Auto-assign orderIndex if not provided (max + 1)
- `PATCH /api/sections/:id` - Update section title/order (admin only)
  - Request: `{ title?: string, orderIndex?: number }`
- `DELETE /api/sections/:id` - Delete section (admin only)
  - Sets photos.section_id to NULL via CASCADE
- Validation: title max 200 chars, orderIndex >= 0
- Error handling for duplicates, not found, auth
- Mount router at `/api` in main index

**Acceptance Criteria:**
- [ ] All CRUD endpoints functional
- [ ] Sections return in order_index order
- [ ] Auto-increment orderIndex works
- [ ] Deleting section clears photos.section_id
- [ ] Admin-only enforcement works
- [ ] Tests pass for all endpoints
- [ ] Type check passes

**Dependencies:** PR #2, PR #3

---

### PR #6: API enhancement - Include sections in trip responses

**Branch:** `feature/issue-119-sections-in-trip-response`
**Type:** feat
**Scope:** api
**Estimated Lines:** ~120

**Files:**
- `api/src/routes/trips.ts` - Update getTripBySlug, getTripById, getAdminTrips

**Changes:**
- Update `TripWithPhotosResponse` interface to include `sections: SectionResponse[]`
- Update `buildTripWithPhotosResponse()` to fetch sections
- Query sections ordered by order_index
- Include section data in trip response
- Update photos to include sectionId in response
- No breaking changes - sections array is new addition

**Acceptance Criteria:**
- [ ] Trip responses include sections array
- [ ] Sections ordered by order_index
- [ ] Photos include sectionId field
- [ ] Existing tests still pass
- [ ] Type check passes

**Dependencies:** PR #5

---

## Phase 5: Frontend Types & Utils (PR 7)

### PR #7: Frontend types - Update database types and utils

**Branch:** `feature/frontend-types-rotation-description-sections`
**Type:** feat
**Scope:** frontend
**Estimated Lines:** ~100

**Files:**
- `app/src/lib/database.types.ts` - Regenerate or manually update types
- `app/src/utils/database.ts` - Add helper functions

**Changes:**
- Update Photo type to include: rotation, description, section_id
- Add Section type interface
- Update ApiTrip type to include sections array
- Add helper functions:
  - `updatePhotoRotation(photoId: string, rotation: number): Promise<Photo>`
  - `updatePhotoDescription(photoId: string, description: string | null): Promise<Photo>`
  - `updatePhotoSection(photoId: string, sectionId: string | null): Promise<Photo>`
  - `createSection(tripId: string, title: string, orderIndex?: number): Promise<Section>`
  - `updateSection(sectionId: string, updates: { title?: string, orderIndex?: number }): Promise<Section>`
  - `deleteSection(sectionId: string): Promise<void>`
  - `getSections(tripId: string): Promise<Section[]>`
- All helpers use JWT auth token from useAuth composable
- Error handling and type safety

**Acceptance Criteria:**
- [ ] Types match API response structure
- [ ] Helper functions make authenticated requests
- [ ] Error handling works correctly
- [ ] Type check passes
- [ ] No breaking changes to existing code

**Dependencies:** PR #6

---

## Phase 6: Rotation UI (PRs 8-9)

### PR #8: Frontend - Apply rotation CSS transforms in all views

**Branch:** `feature/issue-117-rotation-display`
**Type:** feat
**Scope:** frontend
**Estimated Lines:** ~120

**Files:**
- `app/src/views/TripView.vue` - Apply rotation in grid, lightbox, map popup
- `app/src/views/AdminView.vue` - Apply rotation in upload preview
- `app/src/components/ProgressiveImage.vue` - Add rotation support (modify)

**Changes:**
- Create computed style binding for rotation transform
- Apply to ProgressiveImage component via style prop
- Rotation logic: `transform: rotate(${photo.rotation}deg)`
- Handle rotation in all photo displays:
  - Trip view photo grid
  - Trip view lightbox
  - Map popup images
  - Admin upload preview (existing photos)
- Ensure aspect ratio handling (90/270 may need height/width swap logic)
- No UI controls yet - just display existing rotation values

**Acceptance Criteria:**
- [ ] Photos with rotation value display rotated
- [ ] All views (grid, lightbox, popup) respect rotation
- [ ] Rotation 0 shows normal
- [ ] Rotation 90/180/270 display correctly
- [ ] No layout breaks at any rotation
- [ ] Test in browser with manually set rotation values

**Dependencies:** PR #7

---

### PR #9: Frontend - Darkroom view with rotation controls

**Branch:** `feature/issue-117-darkroom-rotation-ui`
**Type:** feat
**Scope:** frontend
**Estimated Lines:** ~400

**Files:**
- `app/src/views/DarkroomView.vue` - New view (create)
- `app/src/router/index.ts` - Add route
- `app/src/views/TripManagementView.vue` - Add link to Darkroom

**Changes:**
- Create DarkroomView component
- Route: `/admin/darkroom/:tripId`
- Layout:
  - Header with trip title, back link
  - Contact sheet: grid of all photos (thumbnails)
  - Select photo opens detail view
  - Detail view shows large photo with rotation controls
- Rotation controls:
  - Rotate CW button (adds 90°, wraps at 360° to 0°)
  - Rotate CCW button (subtracts 90°, wraps below 0° to 270°)
  - Reset button (sets to 0°)
- Auto-save on rotation change (debounced 500ms)
- Visual feedback during save
- Keyboard shortcuts: R (rotate CW), Shift+R (rotate CCW)
- Use shadcn-vue Card, Button components
- Contact sheet uses ProgressiveImage with rotation applied

**Acceptance Criteria:**
- [ ] Darkroom view accessible from Trip Management
- [ ] Contact sheet displays all photos
- [ ] Selecting photo shows detail view
- [ ] Rotation buttons work correctly
- [ ] Auto-save persists changes
- [ ] Keyboard shortcuts functional
- [ ] Loading/error states handled
- [ ] Type check passes
- [ ] Manual browser test successful

**Dependencies:** PR #8

---

## Phase 7: Description UI (PR 10)

### PR #10: Frontend - Workshop view with description editor

**Branch:** `feature/issue-118-workshop-descriptions`
**Type:** feat
**Scope:** frontend
**Estimated Lines:** ~450

**Files:**
- `app/src/views/WorkshopView.vue` - New view (create)
- `app/src/router/index.ts` - Add route
- `app/src/views/TripManagementView.vue` - Add link to Workshop
- `app/src/views/TripView.vue` - Display descriptions in lightbox

**Changes:**
- Create WorkshopView component
- Route: `/admin/workshop/:tripId`
- Layout:
  - Header with trip title, sections toggle, back link
  - Photo list (chronological by default)
  - Each photo card shows:
    - Thumbnail (with rotation applied)
    - Taken date, location if available
    - Description textarea (inline editing)
- Description editor:
  - Textarea with auto-resize
  - Character counter (suggest 500 char soft limit, no hard limit)
  - Auto-save on blur or debounced while typing (1000ms)
  - Save indicator (saving/saved/error)
  - Placeholder text: "Add a story for this photo..."
- Update TripView lightbox to show description below photo
- Use shadcn-vue Textarea, Card, Badge components
- Responsive layout (stack on mobile)

**Acceptance Criteria:**
- [ ] Workshop view accessible from Trip Management
- [ ] All photos listed with thumbnails
- [ ] Description textarea editable
- [ ] Auto-save works on blur and while typing
- [ ] Character counter displays
- [ ] Descriptions appear in trip view lightbox
- [ ] Loading/error states handled
- [ ] Type check passes
- [ ] Manual browser test successful

**Dependencies:** PR #7

---

## Phase 8: Sections UI (PRs 11-12)

### PR #11: Frontend - Section management UI in Workshop

**Branch:** `feature/issue-119-workshop-sections-ui`
**Type:** feat
**Scope:** frontend
**Estimated Lines:** ~400

**Files:**
- `app/src/views/WorkshopView.vue` - Add section management panel

**Changes:**
- Add section management mode toggle to Workshop header
- Section panel (collapsible sidebar or top bar):
  - List all sections with title and photo count
  - Create new section button + dialog
  - Edit section title (inline or dialog)
  - Delete section button (with confirmation)
  - Drag to reorder sections (updates order_index)
- Photo assignment:
  - Each photo card shows current section badge
  - Click badge to open section picker dropdown
  - "Unsectioned" option to remove from section
  - Assign photo to section updates photo.section_id
- Create section dialog:
  - Input for section title
  - Optional order position (default: end)
  - Create button (calls API)
- Delete section confirmation:
  - Warns that photos will be unsectioned (not deleted)
  - Confirm button
- Use shadcn-vue Dialog, Select, DropdownMenu components
- Visual feedback for all operations
- Error handling for all API calls

**Acceptance Criteria:**
- [ ] Can create new sections
- [ ] Can edit section titles
- [ ] Can delete sections (photos unsectioned)
- [ ] Can assign photos to sections
- [ ] Can unassign photos from sections
- [ ] Section badge shows on photo cards
- [ ] Loading/error states handled
- [ ] Type check passes
- [ ] Manual browser test successful

**Dependencies:** PR #10

---

### PR #12: Frontend - Display sections in trip view

**Branch:** `feature/issue-119-trip-sections-display`
**Type:** feat
**Scope:** frontend
**Estimated Lines:** ~350

**Files:**
- `app/src/views/TripView.vue` - Update photo grid to show sections

**Changes:**
- Group photos by section in trip view
- Display structure:
  - Unsectioned photos first (if any)
  - Then sections in order_index order
  - Each section has:
    - Section title header (h3 or h4)
    - Separator/divider
    - Photos in that section (chronological)
- Section headers styled distinctly (slightly larger text, subtle background)
- Maintain existing grid layout within each section
- Lightbox navigation respects section boundaries (optional, can navigate across all)
- Map view unchanged (shows all photos regardless of section)
- If no sections exist, display remains unchanged (just photo grid)
- Use shadcn-vue Separator component

**Acceptance Criteria:**
- [ ] Photos grouped by section
- [ ] Section headers display correctly
- [ ] Order matches section order_index
- [ ] Unsectioned photos appear first
- [ ] Grid layout maintained within sections
- [ ] No sections = original display
- [ ] Map view unaffected
- [ ] Type check passes
- [ ] Manual browser test successful

**Dependencies:** PR #11

---

## Testing Strategy

Tests should be included in relevant PRs:

### Unit Tests
- PR #4: Photo PATCH endpoint validation tests
- PR #5: Section CRUD endpoint tests
- PR #7: Frontend helper function tests (optional, if time allows)

### Integration Tests
- PR #6: Trip response includes sections and updated photo fields
- PR #9: Rotation persists and displays correctly across views
- PR #10: Description auto-save and display
- PR #11: Section management operations
- PR #12: Section grouping in trip view

### Manual Browser Testing (Required)
- PR #8: Visual rotation test (all angles, all views)
- PR #9: Darkroom workflow (select, rotate, save)
- PR #10: Workshop description editing (typing, blur, save indicators)
- PR #11: Section CRUD and photo assignment
- PR #12: Section display in public trip view
- All PRs: Dark mode compatibility

## Verification Checklist

Before merging each PR:
- [ ] Tests pass: `pnpm test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Lint passes: `pnpm lint`
- [ ] Manual verification in browser (where applicable)
- [ ] Dark mode works correctly (where applicable)
- [ ] Mobile responsive (where applicable)
- [ ] No console errors

Before final PR #12 merge:
- [ ] Full workflow test: Upload trip → Darkroom (rotate) → Workshop (describe, section) → View public trip
- [ ] All three issues (#117, #118, #119) acceptance criteria met
- [ ] Documentation updated if needed

## Parallelization Opportunities

Can work in parallel:
- PR #1 and PR #2 (independent schema changes)
- PR #4 and PR #5 (different API routers) - AFTER PR #3
- PR #9 and PR #10 (different views) - AFTER PR #8

Sequential dependencies:
- Phase 1 → Phase 2 (schema before API types)
- Phase 2 → Phase 3-4 (types before endpoints)
- Phase 4-5 → Phase 6-8 (API before frontend)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CSS rotation breaks aspect ratio on 90/270 | Test thoroughly, use transform-origin, container aspect ratio handling |
| Description auto-save conflicts with rapid edits | Debounce saves, cancel in-flight requests, optimistic UI updates |
| Section reordering causes order_index conflicts | Use gap numbering (0, 100, 200...) or transaction-based reorder |
| Large trips (360 photos) slow to load in Darkroom/Workshop | Implement virtualized scrolling or pagination in future PR |
| Migration fails on production database | Test migration on copy first, include rollback script |

## Resolved Decisions

**Confirmed by user (2025-12-23):**

1. **Description length**: Soft limit 500 chars (no hard limit) ✅
2. **Unsaved warning**: Yes - show warning if user navigates away with unsaved changes ✅
3. **Section colors**: Wait - YAGNI applies, add field when needed ✅
4. **Markdown support**: Yes - descriptions will support Markdown formatting ✅
5. **Rotation approach**: CSS-only for MVP (no server-side processing) ✅

**Final Approach:**
- Auto-save preferred over manual save buttons
- Markdown descriptions (render in trip view)
- CSS-only rotation (no server-side processing)
- No section colors in initial schema (YAGNI)

## Post-MVP Enhancements

Features deferred to future PRs:
- Server-side image rotation (Sharp) for downloads/sharing
- Markdown support in descriptions
- Auto-detect sections based on GPS clustering or time gaps
- Per-section color schemes
- Bulk operations (rotate all, describe multiple)
- Photo sorting within sections (manual drag-and-drop)
- Section-based map filtering (show/hide section on map)
- Virtualized scrolling for large trips (>100 photos)

---

**Plan Version:** 1.0
**Created:** 2025-12-23
**Ready for Implementation:** Yes (pending user clarification on open questions)

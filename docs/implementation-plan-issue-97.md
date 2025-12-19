# Implementation Plan: Edit and Resume Draft Trip Uploads

**Issue:** #97
**Branch:** `feature/issue-97-edit-resume-draft-trips`
**Complexity:** Medium
**Total Commits:** 7

## Overview
Enable admins to edit and resume draft trip uploads by adding an "Edit" button to draft TripCards that loads the trip into AdminView, allowing additional photos to be uploaded and the trip to be published when ready. This prevents data loss when uploads fail and eliminates the need to restart from scratch.

## Prerequisites
- [ ] Issue #92 completed (draft trips visible in TripManagementView)
- [ ] Issue #90 completed (self-hosted photo upload endpoint)
- [ ] Upload endpoint `POST /api/trips/:tripId/photos/upload` functional

## Architecture

### Components
- `GET /api/trips/:id` - Backend endpoint to fetch trip by UUID (admin-only)
- `DELETE /api/photos/:id` - Backend endpoint to delete individual photo from trip
- `getTripById()` - Frontend utility function to fetch trip by ID
- `deletePhoto()` - Frontend utility function to delete a photo
- `TripCard` - Add "Edit" button for draft trips (admin context only)
- `AdminView` - Edit mode to load existing trip, display photos, add more, and publish

### Data Flow
```
Draft Trip Card → Click "Edit" → Navigate to /admin?tripId=xxx
                                       ↓
                              AdminView detects tripId
                                       ↓
                              GET /api/trips/:id (with photos)
                                       ↓
                              Populate form + display existing photos
                                       ↓
User adds more photos → Upload → POST /api/trips/:tripId/photos/upload
                                       ↓
User clicks "Delete" on photo → DELETE /api/photos/:id → Remove from UI
                                       ↓
User clicks "Publish" → PATCH /api/trips/:id {isPublic: true} → Redirect to trip view
```

## Atomic Commits

Each commit is a reviewable unit. Implementer completes one commit, returns diff for review, then proceeds to next.

### Commit 1: feat(api): add GET /api/trips/:id endpoint
**Type:** feat
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.ts` - Create GET /:id handler

**Changes:**
- Add `GET /api/trips/:id` endpoint after existing `GET /api/trips/:slug`
- Require admin authentication (`requireAdmin` middleware)
- Validate UUID format of trip ID
- Fetch trip from database by UUID
- Fetch all photos for trip (ordered by `taken_at ASC`)
- Return `TripWithPhotosResponse` format (same as slug endpoint)
- Handle 404 if trip not found
- Handle 400 for invalid UUID format

**Acceptance Criteria:**
- [ ] Endpoint returns trip with photos array for valid UUID
- [ ] Returns 404 for non-existent trip ID
- [ ] Returns 400 for malformed UUID
- [ ] Returns 401 for non-admin users
- [ ] Types pass: `cd api && bun run type-check`
- [ ] Response format matches existing `GET /api/trips/:slug` structure

---

### Commit 2: feat(api): add DELETE /api/photos/:id endpoint
**Type:** feat
**Scope:** api/photos
**Files:**
- `api/src/routes/trips.ts` - Add DELETE handler for photos (or create new `photos.ts` route file)

**Changes:**
- Add `DELETE /api/trips/photos/:id` endpoint (nest under trips for now)
- Require admin authentication (`requireAdmin` middleware)
- Validate UUID format of photo ID
- Fetch photo from database to get `trip_id` and `url` for disk cleanup
- Delete photo record from database
- Parse photo path from URL to delete from disk (e.g., `/api/photos/{tripId}/{filename}`)
- Delete file from disk at `{PHOTOS_DIR}/{tripId}/{filename}`
- Return 204 No Content on success
- Handle 404 if photo not found
- Handle 400 for invalid UUID format
- Log but don't fail if disk deletion fails (DB already committed)

**Acceptance Criteria:**
- [ ] Photo deleted from database
- [ ] Photo file deleted from disk
- [ ] Returns 204 on success
- [ ] Returns 404 for non-existent photo
- [ ] Returns 401 for non-admin
- [ ] Handles missing disk file gracefully (logs error, returns 204)
- [ ] Types pass: `cd api && bun run type-check`

---

### Commit 3: test(api): add tests for GET trip by ID and DELETE photo
**Type:** test
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.test.ts` - Add test cases

**Changes:**
- Add test suite for `GET /api/trips/:id`
  - Returns trip with photos for valid UUID (admin)
  - Returns 401 for non-admin
  - Returns 404 for non-existent trip
  - Returns 400 for invalid UUID format
- Add test suite for `DELETE /api/trips/photos/:id`
  - Deletes photo and returns 204 (admin)
  - Returns 401 for non-admin
  - Returns 404 for non-existent photo
  - Returns 400 for invalid UUID format
  - Handles missing disk file gracefully

**Acceptance Criteria:**
- [ ] All tests pass: `cd api && bun test trips.test.ts`
- [ ] Test coverage includes auth, validation, and success cases
- [ ] Tests use shared helpers from `test-helpers.ts`
- [ ] Types pass: `cd api && bun run type-check`

---

### Commit 4: feat(app): add getTripById and deletePhoto utilities
**Type:** feat
**Scope:** app/database
**Files:**
- `app/src/utils/database.ts` - Add two new functions

**Changes:**
- Add `getTripById(tripId: string): Promise<(ApiTrip & { photos: Photo[] }) | null>`
  - Call `GET /api/trips/:id` with admin auth token
  - Transform API response (camelCase) to database types (snake_case)
  - Return null if 404 (trip not found)
  - Throw ApiError for other errors
- Add `deletePhoto(photoId: string): Promise<void>`
  - Call `DELETE /api/trips/photos/:id` with admin auth token
  - Handle 204 success
  - Throw ApiError on failure

**Acceptance Criteria:**
- [ ] `getTripById()` fetches trip with photos
- [ ] Returns null for non-existent trip
- [ ] `deletePhoto()` successfully deletes photo
- [ ] Both functions require authentication
- [ ] Types pass: `cd app && pnpm type-check`
- [ ] Manual verification: test in browser console if needed

---

### Commit 5: feat(app): add Edit button to TripCard for draft trips
**Type:** feat
**Scope:** app/TripCard
**Files:**
- `app/src/components/TripCard.vue` - Add edit button and onEdit callback

**Changes:**
- Add optional `onEdit?: () => void` prop to TripCard component
- Display "Edit" button next to "Delete" button when:
  - `isDraft` is true AND
  - `onEdit` callback is provided
- Use same icon button styling as delete button
- Use pencil/edit icon (SVG)
- Prevent navigation to trip view when clicking edit button (`@click.prevent.stop`)
- Call `onEdit()` callback when clicked

**Acceptance Criteria:**
- [ ] Edit button appears only on draft trips with onEdit prop
- [ ] Clicking edit button calls onEdit callback
- [ ] Clicking edit button does NOT navigate to trip view
- [ ] Button styling matches delete button pattern
- [ ] Types pass: `cd app && pnpm type-check`
- [ ] Visual verification: buttons appear correctly in TripManagementView

---

### Commit 6: feat(app): implement edit mode in AdminView
**Type:** feat
**Scope:** app/AdminView
**Files:**
- `app/src/views/AdminView.vue` - Add edit mode detection and logic
- `app/src/views/TripManagementView.vue` - Add onEdit handler to draft cards

**Changes:**
- **AdminView.vue:**
  - Detect `tripId` query param from route on mount
  - If `tripId` exists, enter "edit mode":
    - Fetch trip using `getTripById(tripId)`
    - Populate form with existing `title` and `description`
    - Store `currentTripId` (already exists)
    - Display existing photos in a grid with delete buttons
    - Change button text from "Start Upload" to "Add Photos"
    - Replace success state header from "Upload Trip" to "Edit Trip"
    - When user clicks "Add Photos", upload new photos to existing trip
    - Add "Publish Trip" button (visible only in edit mode, enabled when photos exist)
    - "Publish Trip" button calls `updateTrip(tripId, { isPublic: true })` then redirects to `/trip/{slug}`
  - Add `deletePhotoFromDraft(photoId: string)` function:
    - Call `deletePhoto(photoId)`
    - Remove photo from `existingPhotos` array
    - Show error alert if deletion fails
  - In upload flow, skip trip creation if `currentTripId` exists
  - After successful upload, update cover photo and publish flag as before

- **TripManagementView.vue:**
  - Add `onEdit` callback to draft TripCards
  - Navigate to `/admin?tripId={trip.id}` when edit clicked

**Acceptance Criteria:**
- [ ] AdminView detects `tripId` query param
- [ ] Form populated with existing trip data in edit mode
- [ ] Existing photos displayed with delete buttons
- [ ] Can delete individual photos from draft
- [ ] Can add more photos to existing trip
- [ ] "Publish Trip" button appears in edit mode
- [ ] Publishing sets `is_public: true` and redirects
- [ ] Edit button in TripManagementView navigates correctly
- [ ] Types pass: `cd app && pnpm type-check`
- [ ] Manual browser test: edit draft trip, add photos, delete photo, publish

---

### Commit 7: test(app): add Playwright E2E test for edit flow
**Type:** test
**Scope:** app/e2e
**Files:**
- `app/tests/edit-draft-trip.spec.ts` - Create new E2E test

**Changes:**
- Create E2E test that:
  - Creates a draft trip via upload (but don't publish)
  - Navigates to `/admin/trips`
  - Verifies draft badge and edit button appear
  - Clicks edit button
  - Verifies form populated with trip data
  - Verifies existing photos displayed
  - Adds additional photo
  - Deletes one existing photo
  - Clicks "Publish Trip"
  - Verifies redirect to trip view
  - Verifies trip is public and shows all photos (remaining + new)

**Acceptance Criteria:**
- [ ] E2E test passes: `cd app && pnpm test:e2e`
- [ ] Test covers full edit-to-publish flow
- [ ] Test verifies photo deletion
- [ ] Test verifies adding photos to draft
- [ ] Types pass: `cd app && pnpm type-check`

---

## Testing Strategy

Tests are integrated into commits:
- **Commit 3:** API unit tests for new endpoints
- **Commit 7:** E2E test for full user journey

Manual testing checklist:
- Create draft trip (upload photos but close browser mid-upload)
- Navigate to `/admin/trips` and verify draft badge
- Click "Edit" and verify form populated
- Delete a photo and verify it's removed
- Add more photos and verify upload
- Click "Publish" and verify redirect
- View published trip and verify all photos present

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full API test suite passes: `cd api && bun test`
- [ ] Full app test suite passes: `cd app && pnpm test`
- [ ] Type check passes: `cd api && bun run type-check && cd ../app && pnpm type-check`
- [ ] Lint passes: `pnpm lint` (from root)
- [ ] Manual verification in browser:
  - [ ] Create draft trip
  - [ ] Edit draft trip
  - [ ] Delete photo from draft
  - [ ] Add photos to draft
  - [ ] Publish draft trip
  - [ ] Verify published trip shows correctly

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race condition if user edits same trip in multiple tabs | Document this as known limitation, consider adding optimistic locking in future |
| Photo deletion fails on disk but succeeds in DB | Log error and return success (DB is source of truth, missing files handled gracefully by GET endpoint) |
| User navigates away during upload in edit mode | Trip remains in draft state, can re-edit and continue (same as current behavior) |
| Cover photo deleted, trip has no cover | On publish, recalculate cover photo from remaining photos (first with GPS or first photo) |

## Open Questions

- **Q:** Should we show a warning if user tries to publish a trip with 0 photos?
  - **A:** Yes, disable "Publish Trip" button if no photos exist, show helper text

- **Q:** Should deleted photos be soft-deleted (marked inactive) or hard-deleted?
  - **A:** Hard delete for now to save disk space, can add soft-delete in future if needed

- **Q:** Should edit mode preserve the 2-step upload flow or simplify it?
  - **A:** Simplify - show form + existing photos on one screen, "Add Photos" triggers upload, "Publish" makes public

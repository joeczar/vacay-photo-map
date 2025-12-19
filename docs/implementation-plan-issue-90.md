# Implementation Plan: Self-hosted Photo Upload Endpoint

**Issue:** #90
**Branch:** `feature/issue-90-self-hosted-upload`
**Complexity:** Medium
**Total Commits:** 6

## Overview

Replace Cloudinary photo uploads with self-hosted storage. Changes the upload flow to create trip first (in draft state), then upload photos directly to the API server which stores them in `/data/photos/{tripId}/`, finally update trip metadata. This eliminates external dependencies and gives us full control over photo storage.

## Prerequisites

- [ ] Docker service running (for volume mount)
- [ ] Admin authentication working (already implemented)

## Architecture

### Components

**Backend:**
- `api/src/routes/upload.ts` - New upload routes for multipart file handling
- `api/src/routes/trips.ts` - Modified to support draft trips
- `api/src/middleware/fileValidation.ts` - File type and size validation
- `docker-compose.yml` - Add volume mount for photo storage

**Frontend:**
- `app/src/lib/upload.ts` - New upload client to replace Cloudinary
- `app/src/views/AdminView.vue` - Refactor to create trip first, then upload
- `app/src/utils/database.ts` - Support for draft trip status

### Data Flow

```
Old Flow:
User fills form → Upload to Cloudinary → Create trip → Save photo metadata

New Flow:
User fills form → Create trip (draft) → Upload to API (/api/trips/:id/photos/upload) → Update trip status
```

### Storage Structure

```
/data/photos/
  /{tripId}/
    {uuid}.jpg
```

### Photo Serving

- Development: `http://localhost:3000/api/photos/{tripId}/{filename}`
- Production: Same pattern, but with production domain

## Atomic Commits

Each commit is a reviewable unit. Implementer completes one commit, returns diff for review, then proceeds to next.

---

### Commit 1: Add photo storage volume to Docker
**Type:** chore
**Scope:** docker
**Files:**
- `docker-compose.yml` - Modify

**Changes:**
- Add volume mount: `./data/photos:/data/photos` to postgres service (or create new file-server service if needed)
- Add `.gitignore` entry for `/data/photos/` to prevent committing uploads
- Add `/data/` directory creation in documentation or setup script

**Acceptance Criteria:**
- [ ] Volume mount added to docker-compose.yml
- [ ] `/data/photos/` ignored in .gitignore
- [ ] Docker service starts successfully: `docker-compose up -d`
- [ ] Can create test directory: `mkdir -p data/photos/test-trip`

**Notes:**
- We're using the host filesystem, not a named volume, so developers can easily access uploaded files
- Directory will be created automatically when first upload happens

---

### Commit 2: Add file validation middleware and types
**Type:** feat
**Scope:** api
**Files:**
- `api/src/middleware/fileValidation.ts` - Create
- `api/src/types/upload.ts` - Create

**Changes:**
- Create `fileValidation.ts` with helpers:
  - `validateImageFile(file: File): boolean` - Check MIME type (image/jpeg, image/png, image/webp)
  - `validateFileSize(file: File, maxSizeMB: number): boolean` - Check size limit
  - `MAX_FILE_SIZE_MB = 10` constant
  - `ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']` constant
- Create `upload.ts` types:
  - `interface UploadedFile { filename: string; path: string; size: number; mimetype: string }`
  - `interface UploadResult { publicId: string; url: string; thumbnailUrl: string; width: number; height: number }`

**Acceptance Criteria:**
- [ ] Types pass: `cd api && pnpm type-check`
- [ ] File exports correctly (no runtime errors)

**Notes:**
- Matching the Cloudinary interface structure makes frontend changes minimal
- `publicId` will be `{tripId}/{filename}` for consistency

---

### Commit 3: Implement photo upload endpoint
**Type:** feat
**Scope:** api
**Files:**
- `api/src/routes/upload.ts` - Create
- `api/src/index.ts` - Modify

**Changes:**
- Create upload route with two endpoints:
  1. `POST /api/trips/:tripId/photos/upload` - Upload single photo (admin only)
     - Use `requireAdmin` middleware
     - Parse multipart form data: `await c.req.parseBody()`
     - Validate trip exists and is owned by user
     - Validate file type and size using middleware from Commit 2
     - Generate UUID for filename: `crypto.randomUUID()`
     - Ensure directory exists: `await Bun.write(\`/data/photos/\${tripId}/\${uuid}.jpg\`, file)`
     - Return `UploadResult` with `publicId: \`\${tripId}/\${filename}\``, `url: \`/api/photos/\${tripId}/\${filename}\``
     - For now: `thumbnailUrl = url` (thumbnail generation is #82)
     - Extract dimensions using `sharp` if available, otherwise return `width: 0, height: 0`
  2. `GET /api/photos/:tripId/:filename` - Serve photo file
     - Public endpoint (no auth required - controlled by trip's is_public)
     - Validate path doesn't contain `..` (directory traversal prevention)
     - Check file exists
     - Serve with proper content-type header
     - Add cache headers: `Cache-Control: public, max-age=31536000, immutable`
- Register routes in `api/src/index.ts`: `app.route('/api', upload)`

**Acceptance Criteria:**
- [ ] Types pass: `cd api && pnpm type-check`
- [ ] Can upload test file: `curl -F "file=@test.jpg" -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/trips/{id}/photos/upload`
- [ ] Can retrieve uploaded file: `curl http://localhost:3000/api/photos/{tripId}/{filename} --output test-download.jpg`
- [ ] Upload fails without auth: returns 401
- [ ] Upload fails with invalid file type: returns 400
- [ ] Upload fails with file >10MB: returns 413 or 400

**Notes:**
- Using Bun.write for file operations (native to Bun runtime)
- Path validation is critical for security
- Max 3 concurrent uploads handled client-side (unchanged from Cloudinary flow)

---

### Commit 4: Create frontend upload client
**Type:** feat
**Scope:** app
**Files:**
- `app/src/lib/upload.ts` - Create

**Changes:**
- Create upload client matching Cloudinary interface:
  - `interface UploadResult { publicId: string; url: string; thumbnailUrl: string; width: number; height: number }`
  - `interface UploadProgress { loaded: number; total: number; percentage: number }`
  - `uploadPhoto(tripId: string, file: File, token: string, onProgress?: (progress: UploadProgress) => void): Promise<UploadResult>`
    - Use XMLHttpRequest for progress tracking (same as Cloudinary)
    - POST to `/api/trips/${tripId}/photos/upload`
    - Include `Authorization: Bearer ${token}` header
    - FormData with `file` field
    - Return transformed response matching `UploadResult` interface
  - `uploadMultipleFiles(tripId: string, files: File[], token: string, onProgress?: (fileIndex: number, progress: UploadProgress) => void, maxConcurrent = 3): Promise<UploadResult[]>`
    - Same concurrency control as Cloudinary (max 3 concurrent)
    - Track per-file progress
    - Return results array in same order as input files

**Acceptance Criteria:**
- [ ] Types pass: `cd app && pnpm type-check`
- [ ] Exports match expected interface
- [ ] No runtime errors when importing

**Notes:**
- Keep XMLHttpRequest for progress (fetch doesn't support upload progress)
- Interface matches Cloudinary so AdminView changes are minimal
- Token passed explicitly (not from composable) for flexibility

---

### Commit 5: Refactor AdminView to create trip first
**Type:** refactor
**Scope:** app
**Files:**
- `app/src/views/AdminView.vue` - Modify

**Changes:**
- Modify `onSubmit` flow:
  1. Extract EXIF (unchanged)
  2. Resize images (unchanged)
  3. **NEW:** Create trip with `is_public: false` initially (draft state)
     - Call `createTrip({ title, description, slug, is_public: false, cover_photo_url: null })`
     - Store returned `trip.id`
  4. Upload photos to new endpoint (replace `uploadMultipleFiles` from cloudinary)
     - Import from `@/lib/upload` instead of `@/lib/cloudinary`
     - Pass `trip.id` as first parameter
     - Pass JWT token from `useAuth().getToken()`
  5. Save photo metadata (unchanged - still calls `createPhotos`)
  6. Set cover photo (unchanged)
  7. **NEW:** Update trip to public after successful upload
     - Call `updateTrip(trip.id, { is_public: true })`
- Update imports:
  - Remove `import { uploadMultipleFiles } from '@/lib/cloudinary'`
  - Add `import { uploadMultipleFiles } from '@/lib/upload'`
  - Add `import { useAuth } from '@/composables/useAuth'`
- Update error handling:
  - If trip creation fails, show error immediately (don't proceed to uploads)
  - If upload fails, trip remains in draft state (user can retry or delete)
- Update progress messages:
  - Change "Uploading photos to cloud storage..." to "Uploading photos..."

**Acceptance Criteria:**
- [ ] Types pass: `cd app && pnpm type-check`
- [ ] No ESLint errors: `cd app && pnpm lint`
- [ ] Form validation still works (can't submit without files)
- [ ] Manual test: Upload a trip with 2-3 photos
  - Progress bar updates correctly
  - Per-file progress displays
  - Trip appears in trip list after upload
  - Photos display on trip view page
  - Photos with GPS show on map

**Notes:**
- Draft state (is_public: false) prevents incomplete trips from showing in public list
- If upload fails mid-way, trip exists but with partial photos (acceptable - user can retry)
- Admin can manually delete failed/draft trips from admin panel

---

### Commit 6: Add tests for upload endpoint
**Type:** test
**Scope:** api
**Files:**
- `api/src/routes/upload.test.ts` - Create

**Changes:**
- Create test suite following pattern from `trips.test.ts`:
  - Set up test environment (JWT_SECRET, etc.)
  - Create admin and non-admin tokens
  - Test cases:
    1. Upload requires authentication (401 without token)
    2. Upload requires admin (403 with non-admin token)
    3. Upload rejects invalid file types (400)
    4. Upload succeeds with valid image and admin token (201)
    5. Photo serving works for uploaded file (200)
    6. Photo serving returns 404 for non-existent file
    7. Photo serving blocks directory traversal (../../../etc/passwd)
- Mock file upload using Bun's File API
- Clean up test files in afterEach

**Acceptance Criteria:**
- [ ] All tests pass: `cd api && pnpm test upload.test.ts`
- [ ] Tests clean up created files (no /data/photos/test-* left behind)
- [ ] Full test suite still passes: `cd api && pnpm test`

**Notes:**
- Use in-memory or temp directory for test uploads to avoid polluting /data/photos
- Or use a test-specific path like `/data/photos-test/` and clean up after

---

## Testing Strategy

### Unit Tests
- Commit 6: API upload endpoint tests (validation, auth, file serving)

### Integration Tests
- Manual testing in Commit 5:
  - Full upload flow from AdminView
  - Photo display in TripView
  - Map markers with GPS data
  - Error handling (network failures, invalid files)

### E2E Tests (Future)
- Consider Playwright test for full upload flow
- Not required for this PR, but good candidate for future test coverage

### Manual Verification Checklist
- [ ] Upload trip with 3 photos (mix of GPS and non-GPS)
- [ ] Verify photos appear in trip view
- [ ] Verify map markers for photos with GPS
- [ ] Verify no-GPS warning icon for photos without GPS
- [ ] Verify thumbnails display correctly (even though same as full size for now)
- [ ] Test concurrent uploads (5+ photos)
- [ ] Test large file rejection (upload 11MB image)
- [ ] Test invalid file type rejection (upload .pdf or .txt)
- [ ] Verify uploaded files in `/data/photos/{tripId}/` directory
- [ ] Verify photos served with correct content-type headers
- [ ] Test in both light and dark mode

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `cd api && pnpm test`
- [ ] Type check passes: `pnpm type-check` (both app and api)
- [ ] Lint passes: `pnpm lint` (both app and api)
- [ ] Manual upload verification completed (see above)
- [ ] Docker volume mount working
- [ ] No Cloudinary references remain in upload code
- [ ] Environment variables documented (no new ones needed)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Directory traversal attacks** | Validate filenames, use UUID naming, check for `..` in paths |
| **Disk space exhaustion** | Add file size limits (10MB), document storage requirements, consider future cleanup jobs |
| **Concurrent write conflicts** | Use UUID filenames (collision-free), Bun.write is atomic |
| **Partial upload failures** | Trip stays in draft state (is_public: false) until all photos uploaded |
| **Missing sharp for dimensions** | Graceful fallback to width: 0, height: 0 (dimensions not critical for MVP) |
| **Large uploads blocking server** | Hono handles streaming, 10MB limit reasonable for photos |
| **Photo serving performance** | Add cache headers (done in Commit 3), consider CDN later |

## Open Questions

**Q:** Should we delete photos from disk when trip/photo is deleted from database?
**A:** Yes - should be implemented. Add to DELETE endpoints in trips.ts:
  - When deleting trip: `rm -rf /data/photos/{tripId}/`
  - When deleting individual photo: `rm /data/photos/{tripId}/{filename}`
  - Use `Bun.file(path).exists()` to check, `Bun.write()` to delete
  - Should be in this PR or follow-up? **Decision needed from user.**

**Q:** Should we validate image dimensions (max width/height)?
**A:** Not critical for MVP. Client-side resize to 1600px handles this. Can add later if needed.

**Q:** Should we generate thumbnails server-side now or wait for #82?
**A:** Wait for #82. For now, `thumbnailUrl = url` (serve full image). This matches the decision in research phase.

**Q:** What happens to existing Cloudinary photos?
**A:** They continue to work (URLs still valid). Migration is separate concern. No breaking changes to existing trips.

**Q:** Should draft trips be visible to admin in UI?
**A:** Current UI only shows public trips. Draft trips are hidden. Admin could manually find by checking database or API. Should we add a "Drafts" section to AdminView? **Decision needed from user.**

## Notes for Implementer

- **Security is critical** - File upload endpoints are common attack vectors. Triple-check:
  - Path validation (no directory traversal)
  - File type validation (MIME type checking)
  - File size limits enforced
  - Authentication/authorization on upload endpoint
- **Preserve EXIF data** - Client-side EXIF extraction (with `xmp: true`) happens BEFORE upload, so server doesn't need to read EXIF
- **Photo serving is public** - Photos served without auth because trip.is_public controls visibility. Private trips will have unguessable UUIDs in path, but URLs are not secret. Consider adding trip.is_public check if needed.
- **Test cleanup** - Tests must clean up files to avoid filling disk
- **Error messages** - Be specific in validation errors to help debugging (e.g., "File type image/pdf not allowed. Allowed types: image/jpeg, image/png, image/webp")

## Follow-up Tasks (Not in this PR)

- [ ] Issue #82: Server-side thumbnail generation with sharp
- [ ] Cleanup job for orphaned photos (photos on disk without DB entry)
- [ ] Disk usage monitoring/alerts
- [ ] Migration tool for existing Cloudinary photos
- [ ] Private trip photo serving (check trip.is_public before serving)
- [ ] Photo optimization pipeline (compression, format conversion)

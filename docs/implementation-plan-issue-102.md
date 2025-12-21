# Implementation Plan: Migrate Photo Storage to Cloudflare R2

**Issue:** #102
**Branch:** `feature/issue-102-migrate-r2-storage`
**Complexity:** Medium
**Total Commits:** 8

## Overview

Migrate photo storage from local filesystem (`/data/photos/`) to Cloudflare R2 for better scalability and CDN performance. The previous attempt (commit 21b7ef3, reverted) failed because deletion operations were not implemented, causing storage leaks when photos/trips were deleted from the database but remained in R2.

This implementation ensures complete CRUD operations including proper deletion handling.

## Prerequisites

- [ ] R2 bucket created in Cloudflare dashboard
- [ ] R2 API credentials generated (Account ID, Access Key ID, Secret Access Key)
- [ ] Understanding that this is a complete migration - no data migration needed since the app is new

## Architecture

### Components

- `R2Client` (`api/src/utils/r2.ts`) - Wrapper around AWS S3 SDK for R2 operations
- `upload.ts` - Modified to upload/serve from R2 instead of local filesystem
- `trips.ts` - Modified to delete from R2 when photos/trips are deleted

### Data Flow

**Upload:**
```
POST /api/trips/:tripId/photos/upload
→ Validate file
→ Generate UUID filename
→ uploadToR2(key, buffer, contentType)
→ Return URL pattern: /api/photos/{tripId}/{filename}
```

**Serve:**
```
GET /api/photos/:tripId/:filename
→ Validate path parameters
→ getFromR2(key)
→ Return file with cache headers
```

**Delete Photo:**
```
DELETE /api/trips/photos/:id
→ Fetch photo record (get url)
→ Delete from database
→ Extract R2 key from URL
→ deleteFromR2(key)
```

**Delete Trip:**
```
DELETE /api/trips/:id
→ Fetch all photos for trip
→ Delete trip (cascade deletes photos)
→ Extract all R2 keys
→ deleteMultipleFromR2(keys[])
```

### R2 Key Structure

```
{tripId}/{uuid}.{ext}
```

Examples:
- `550e8400-e29b-41d4-a716-446655440000/a8f3e2d1-b4c5-4a3b-9e2f-1c0d8e7f6a5b.jpg`
- `550e8400-e29b-41d4-a716-446655440000/b9e4f3e2-c5d6-5b4c-af3g-2d1e9f8g7b6c.png`

## Atomic Commits

---

### Commit 1: Add R2 and image processing dependencies

**Type:** chore
**Scope:** api
**Files:**
- `api/package.json` - Modify (add dependencies)
- `api/bun.lockb` - Modify (auto-generated)

**Changes:**
- Add `@aws-sdk/client-s3` ^3.956.0 to dependencies
- Add `sharp` ^0.34.5 to dependencies
- Run `bun install` to update lockfile

**Acceptance Criteria:**
- [ ] Dependencies added to package.json
- [ ] `bun install` runs successfully
- [ ] No breaking changes to existing functionality
- [ ] Types available: `import { S3Client } from '@aws-sdk/client-s3'`

**Commands:**
```bash
cd /Users/joeczarnecki/Code/personal/vacay-photo-map/api
bun add @aws-sdk/client-s3@^3.956.0
bun add sharp@^0.34.5
```

---

### Commit 2: Create R2 client utility with all CRUD operations

**Type:** feat
**Scope:** api/utils
**Files:**
- `api/src/utils/r2.ts` - Create

**Changes:**
- Create R2Client class with S3Client initialization
- Implement `uploadToR2(key, body, contentType)` using `PutObjectCommand`
- Implement `getFromR2(key)` using `GetObjectCommand`
- Implement `deleteFromR2(key)` using `DeleteObjectCommand`
- Implement `deleteMultipleFromR2(keys[])` using `DeleteObjectsCommand`
- Add environment variable validation (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)
- Return `null` if R2 not configured (allows local dev without R2)
- Add JSDoc documentation for all functions

**Implementation:**

```typescript
/**
 * Cloudflare R2 Storage Client
 *
 * Wrapper around AWS S3 SDK for R2 operations. Returns null for all
 * operations if R2 credentials are not configured, allowing local
 * development without R2.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  type PutObjectCommandInput,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";

// Environment validation
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Check if R2 is configured
const isR2Configured = !!(
  R2_ACCOUNT_ID &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_BUCKET_NAME
);

// Initialize S3 client for R2
let r2Client: S3Client | null = null;

if (isR2Configured) {
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload file to R2 bucket
 * @param key - Object key (e.g., "tripId/filename.jpg")
 * @param body - File buffer
 * @param contentType - MIME type (e.g., "image/jpeg")
 * @returns true if uploaded, false if R2 not configured
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<boolean> {
  if (!r2Client || !R2_BUCKET_NAME) {
    console.warn("R2 not configured, skipping upload");
    return false;
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await r2Client.send(command);
  return true;
}

/**
 * Get file from R2 bucket
 * @param key - Object key (e.g., "tripId/filename.jpg")
 * @returns GetObjectCommandOutput or null if not found/not configured
 */
export async function getFromR2(
  key: string,
): Promise<GetObjectCommandOutput | null> {
  if (!r2Client || !R2_BUCKET_NAME) {
    console.warn("R2 not configured, cannot retrieve file");
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    return await r2Client.send(command);
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

/**
 * Delete single file from R2 bucket
 * @param key - Object key (e.g., "tripId/filename.jpg")
 * @returns true if deleted, false if R2 not configured
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  if (!r2Client || !R2_BUCKET_NAME) {
    console.warn("R2 not configured, skipping deletion");
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(`Failed to delete ${key} from R2:`, error);
    // Don't throw - deletion errors shouldn't fail the request
    // Database is source of truth
    return false;
  }
}

/**
 * Delete multiple files from R2 bucket (batch operation)
 * @param keys - Array of object keys
 * @returns Number of files deleted
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<number> {
  if (!r2Client || !R2_BUCKET_NAME || keys.length === 0) {
    if (keys.length > 0) {
      console.warn("R2 not configured, skipping batch deletion");
    }
    return 0;
  }

  try {
    const command = new DeleteObjectsCommand({
      Bucket: R2_BUCKET_NAME,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    });

    const result = await r2Client.send(command);
    return result.Deleted?.length || 0;
  } catch (error) {
    console.error(`Failed to delete ${keys.length} files from R2:`, error);
    // Don't throw - deletion errors shouldn't fail the request
    return 0;
  }
}

/**
 * Check if R2 is configured and available
 */
export function isR2Available(): boolean {
  return isR2Configured;
}
```

**Acceptance Criteria:**
- [ ] R2Client initializes when env vars present
- [ ] Returns null/false when env vars missing (no crashes)
- [ ] All functions have JSDoc comments
- [ ] Error handling prevents request failures
- [ ] Types pass: `bun run type-check`

---

### Commit 3: Migrate upload endpoint to R2

**Type:** feat
**Scope:** api/upload
**Files:**
- `api/src/routes/upload.ts` - Modify

**Changes:**
- Import R2 utilities and sharp
- Replace `Bun.write()` with `uploadToR2()`
- Use sharp to extract image dimensions during upload
- Keep local filesystem fallback if R2 not configured
- Maintain same URL pattern: `/api/photos/{tripId}/{filename}`

**Key Code Changes:**

```typescript
import sharp from "sharp";
import { uploadToR2, isR2Available } from "../utils/r2";

// In POST /api/trips/:tripId/photos/upload handler:

// 6. Process image and upload
const arrayBuffer = await file.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);

// Extract dimensions with sharp
const metadata = await sharp(buffer).metadata();
const width = metadata.width || 0;
const height = metadata.height || 0;

// Upload to R2 if configured, otherwise fall back to local filesystem
const uploadedToR2 = await uploadToR2(
  `${tripId}/${filename}`,
  buffer,
  file.type
);

if (!uploadedToR2) {
  // Fallback: local filesystem (for dev without R2)
  await mkdir(dirPath, { recursive: true });
  await Bun.write(filePath, buffer);
}

// 7. Build response
const result: UploadResult = {
  publicId: `${tripId}/${filename}`,
  url: `/api/photos/${tripId}/${filename}`,
  thumbnailUrl: `/api/photos/${tripId}/${filename}`,
  width,
  height,
};
```

**Acceptance Criteria:**
- [ ] File uploads to R2 when configured
- [ ] Falls back to local filesystem when R2 not configured
- [ ] Extracts actual image dimensions (not 0,0)
- [ ] Returns 201 with correct response shape
- [ ] Tests pass: `bun test upload.test.ts`
- [ ] Types pass: `bun run type-check`

---

### Commit 4: Migrate serving endpoint to R2

**Type:** feat
**Scope:** api/upload
**Files:**
- `api/src/routes/upload.ts` - Modify

**Changes:**
- Import R2 utilities
- Replace `Bun.file()` with `getFromR2()`
- Convert R2 stream to Response
- Maintain cache headers
- Keep local filesystem fallback if R2 not configured

**Key Code Changes:**

```typescript
import { getFromR2, isR2Available } from "../utils/r2";

// In GET /api/photos/:tripId/:filename handler:

const key = `${tripId}/${filename}`;

// Try R2 first if configured
if (isR2Available()) {
  const r2Object = await getFromR2(key);

  if (!r2Object) {
    return c.json({ error: "Photo not found" }, 404);
  }

  // Convert R2 stream to buffer
  const stream = r2Object.Body;
  if (!stream) {
    return c.json({ error: "Photo not found" }, 404);
  }

  // Stream to buffer (R2 Body is a ReadableStream)
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// Fallback: local filesystem
const filePath = `${getPhotosDir()}/${tripId}/${filename}`;
const file = Bun.file(filePath);

if (!(await file.exists())) {
  return c.json({ error: "Photo not found" }, 404);
}

return new Response(file, {
  headers: {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  },
});
```

**Acceptance Criteria:**
- [ ] Serves files from R2 when configured
- [ ] Falls back to local filesystem when R2 not configured
- [ ] Returns correct Content-Type
- [ ] Returns immutable cache headers
- [ ] Returns 404 for missing files
- [ ] Tests pass: `bun test upload.test.ts`
- [ ] Types pass: `bun run type-check`

---

### Commit 5: Migrate photo deletion to R2

**Type:** feat
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.ts` - Modify

**Changes:**
- Import R2 utilities
- Replace `rm()` calls with `deleteFromR2()`
- Extract R2 key from photo URL
- Delete from R2 before or after DB deletion (DB is source of truth)
- Log but don't fail on R2 deletion errors

**Key Code Changes:**

```typescript
import { deleteFromR2, isR2Available } from "../utils/r2";

// In DELETE /api/trips/photos/:id handler (around line 854):

// Delete photo from database
await db`
  DELETE FROM photos
  WHERE id = ${id}
`;

// Clean up photo files from R2 or local filesystem
try {
  if (isR2Available()) {
    // Extract R2 key from URL: /api/photos/{tripId}/{filename} -> {tripId}/{filename}
    const photoKey = photo.url.replace("/api/photos/", "");
    const thumbnailKey = photo.thumbnail_url.replace("/api/photos/", "");

    // Delete from R2 (both main and thumbnail)
    await deleteFromR2(photoKey);

    // Only delete thumbnail if different from photo (will be same until #82)
    if (thumbnailKey !== photoKey) {
      await deleteFromR2(thumbnailKey);
    }
  } else {
    // Fallback: local filesystem
    const photosDir = getPhotosDir();
    const photoPath = `${photosDir}/${photo.url.replace("/api/photos/", "")}`;
    const thumbnailPath = `${photosDir}/${photo.thumbnail_url.replace("/api/photos/", "")}`;

    await rm(photoPath, { force: true });
    await rm(thumbnailPath, { force: true });
  }
} catch (error) {
  // Log but don't fail - database is source of truth
  console.error(
    `Failed to clean up files for photo ${id} (url: ${photo.url}):`,
    error
  );
}

// 204 No Content
return c.body(null, 204);
```

**Acceptance Criteria:**
- [ ] Deleting photo removes it from R2
- [ ] Falls back to local filesystem when R2 not configured
- [ ] Database deletion succeeds even if R2 deletion fails
- [ ] No orphaned files in R2 after successful deletion
- [ ] Tests verify actual deletion (not just mocked)
- [ ] Types pass: `bun run type-check`

---

### Commit 6: Migrate trip deletion to R2

**Type:** feat
**Scope:** api/trips
**Files:**
- `api/src/routes/trips.ts` - Modify

**Changes:**
- Import R2 utilities
- Fetch all photos for trip before deletion
- Replace `rm(tripDir, {recursive: true})` with `deleteMultipleFromR2()`
- Use batch deletion for efficiency
- Extract R2 keys from photo URLs
- Log but don't fail on R2 deletion errors

**Key Code Changes:**

```typescript
import { deleteMultipleFromR2, isR2Available } from "../utils/r2";

// In DELETE /api/trips/:id handler (around line 629):

// Fetch all photos for this trip before deletion
const photosResults = await db<{ url: string; thumbnail_url: string }[]>`
  SELECT url, thumbnail_url
  FROM photos
  WHERE trip_id = ${id}
`;

// Delete trip (cascade deletes photos via foreign key)
const result = await db`
  DELETE FROM trips
  WHERE id = ${id}
  RETURNING id
`;

if (result.length === 0) {
  return c.json({ error: "Not Found", message: "Trip not found" }, 404);
}

// Clean up photo files from R2 or local filesystem
try {
  if (isR2Available()) {
    // Extract all R2 keys from photo URLs
    const keys = new Set<string>();

    for (const photo of photosResults) {
      keys.add(photo.url.replace("/api/photos/", ""));

      // Add thumbnail if different (will be same until #82)
      const thumbnailKey = photo.thumbnail_url.replace("/api/photos/", "");
      if (thumbnailKey !== photo.url.replace("/api/photos/", "")) {
        keys.add(thumbnailKey);
      }
    }

    // Batch delete from R2
    const deleted = await deleteMultipleFromR2(Array.from(keys));
    console.log(`Deleted ${deleted} files from R2 for trip ${id}`);
  } else {
    // Fallback: local filesystem
    const photosDir = getPhotosDir();
    const tripDir = `${photosDir}/${id}`;
    await rm(tripDir, { recursive: true, force: true });
  }
} catch (error) {
  // Log but don't fail - database is source of truth
  console.error(`Failed to delete photos for trip ${id}:`, error);
}

// 204 No Content
return c.body(null, 204);
```

**Acceptance Criteria:**
- [ ] Deleting trip removes all photos from R2
- [ ] Uses batch deletion (DeleteObjectsCommand) for efficiency
- [ ] Falls back to local filesystem when R2 not configured
- [ ] Database deletion succeeds even if R2 deletion fails
- [ ] No orphaned files in R2 after successful deletion
- [ ] Tests verify actual deletion (not just mocked)
- [ ] Types pass: `bun run type-check`

---

### Commit 7: Add tests with R2 mocking

**Type:** test
**Scope:** api/utils
**Files:**
- `api/src/utils/r2.test.ts` - Create
- `api/src/routes/upload.test.ts` - Modify
- `api/src/test-helpers.ts` - Modify (add R2 mock helpers)

**Changes:**
- Create unit tests for R2 utility functions
- Mock S3Client using Bun's mock system
- Test upload, get, delete, and batch delete operations
- Verify R2 functions return false/null when not configured
- Update upload.test.ts to mock R2 in integration tests
- Add R2 mock helpers to test-helpers.ts

**R2 Unit Tests (`r2.test.ts`):**

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { S3Client } from "@aws-sdk/client-s3";

// Mock S3Client before importing r2 module
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: mock(() => ({
    send: mock(() => Promise.resolve({})),
  })),
  PutObjectCommand: mock((input: any) => input),
  GetObjectCommand: mock((input: any) => input),
  DeleteObjectCommand: mock((input: any) => input),
  DeleteObjectsCommand: mock((input: any) => input),
}));

import {
  uploadToR2,
  getFromR2,
  deleteFromR2,
  deleteMultipleFromR2,
  isR2Available,
} from "./r2";

describe("R2 Client", () => {
  describe("isR2Available", () => {
    it("returns true when all R2 env vars are set", () => {
      // Env vars set in .env.test
      expect(isR2Available()).toBe(true);
    });
  });

  describe("uploadToR2", () => {
    it("uploads file to R2 bucket", async () => {
      const buffer = Buffer.from("test image data");
      const result = await uploadToR2("trip-123/photo.jpg", buffer, "image/jpeg");
      expect(result).toBe(true);
    });
  });

  describe("getFromR2", () => {
    it("retrieves file from R2 bucket", async () => {
      const result = await getFromR2("trip-123/photo.jpg");
      expect(result).toBeDefined();
    });
  });

  describe("deleteFromR2", () => {
    it("deletes file from R2 bucket", async () => {
      const result = await deleteFromR2("trip-123/photo.jpg");
      expect(result).toBe(true);
    });
  });

  describe("deleteMultipleFromR2", () => {
    it("batch deletes files from R2 bucket", async () => {
      const keys = ["trip-123/photo1.jpg", "trip-123/photo2.jpg"];
      const result = await deleteMultipleFromR2(keys);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("returns 0 for empty array", async () => {
      const result = await deleteMultipleFromR2([]);
      expect(result).toBe(0);
    });
  });
});
```

**Upload Test Updates:**

```typescript
// In upload.test.ts, add at the top:

// Mock R2 module for tests
import { mock } from "bun:test";

mock.module("../utils/r2", () => ({
  uploadToR2: mock(() => Promise.resolve(true)),
  getFromR2: mock(() => Promise.resolve({
    Body: {
      getReader: () => ({
        read: mock()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([0xff, 0xd8]) })
          .mockResolvedValueOnce({ done: true }),
      }),
    },
  })),
  deleteFromR2: mock(() => Promise.resolve(true)),
  deleteMultipleFromR2: mock(() => Promise.resolve(2)),
  isR2Available: mock(() => true),
}));
```

**Test Helpers:**

```typescript
// Add to test-helpers.ts:

/**
 * Create mock R2 response for getFromR2
 */
export function createMockR2Response(data: Uint8Array) {
  return {
    Body: {
      getReader: () => ({
        async *[Symbol.asyncIterator]() {
          yield data;
        },
        read: async () => ({ done: false, value: data }),
      }),
    },
  };
}
```

**Acceptance Criteria:**
- [ ] R2 unit tests pass in isolation
- [ ] Upload integration tests pass with R2 mocked
- [ ] All existing tests still pass
- [ ] Tests verify behavior, not implementation
- [ ] No hardcoded env vars in test files
- [ ] Tests pass: `bun test`
- [ ] Types pass: `bun run type-check`

---

### Commit 8: Update environment configuration

**Type:** docs
**Scope:** api
**Files:**
- `api/.env.example` - Modify
- `api/.env.test.example` - Modify (if exists)

**Changes:**
- Add R2 environment variables with descriptions
- Include example values (placeholders)
- Document optional nature (for local dev)

**Environment Variables:**

```bash
# Add to .env.example after DATABASE_* section:

# Cloudflare R2 Storage (optional for local dev)
# Get credentials from Cloudflare Dashboard -> R2 -> Manage R2 API Tokens
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=vacay-photos

# Photos directory (fallback when R2 not configured)
PHOTOS_DIR=/data/photos
```

**Acceptance Criteria:**
- [ ] .env.example updated with clear comments
- [ ] R2 variables documented as optional
- [ ] Local dev instructions clear
- [ ] No secrets committed

---

## Testing Strategy

### Unit Tests (Commit 7)
- R2 client functions with S3Client mocked
- Test both success and failure cases
- Verify graceful degradation when R2 not configured

### Integration Tests (Commits 3-6)
- Upload endpoint with R2 mocked
- Serving endpoint with R2 mocked
- Deletion endpoints - **CRITICAL: Must verify actual deletion behavior**
- Use test helpers to avoid duplication

### Manual Testing (Post-Implementation)
- Deploy to staging with real R2 bucket
- Upload photos and verify in R2 dashboard
- Delete photos and verify removal from R2
- Delete trip and verify all photos removed
- Test local dev without R2 configuration

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `bun test`
- [ ] Type check passes: `bun run type-check`
- [ ] Upload to R2 works (manual test)
- [ ] Serve from R2 works (manual test)
- [ ] Photo deletion removes from R2 (manual test)
- [ ] Trip deletion removes all photos from R2 (manual test)
- [ ] No orphaned files in R2 after deletions
- [ ] Local dev works without R2 configuration
- [ ] Cache headers present on served images

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| R2 deletion fails silently | Log all failures, but don't fail requests. Database is source of truth. Monitor logs. |
| R2 rate limits during batch delete | Use DeleteObjectsCommand (batch) instead of individual DeleteObjectCommand calls. |
| Large files timeout | R2 handles streaming well. Keep timeout defaults. Monitor in production. |
| R2 credentials leaked | Never commit .env files. Use .env.example with placeholders only. |
| Local dev requires R2 | Graceful fallback to local filesystem when R2 not configured. |
| Test mocks hide real bugs | Write integration tests that verify behavior. Manual test deletion in staging. |
| Stream conversion complexity | Use well-tested pattern for ReadableStream to Buffer conversion. |

## Open Questions

None - all requirements clear from previous failed attempt and research findings.

## Notes

### Why Previous Attempt Failed

Commit 21b7ef3 (reverted) implemented upload and serving but:
1. No `deleteFromR2()` function existed
2. DELETE endpoints still used `rm()` for local filesystem
3. Tests only checked DB deletion, not R2 cleanup
4. Would have caused storage leaks (photos deleted from DB but not R2)

### Critical Implementation Details

1. **R2 Key Extraction**: URLs are `/api/photos/{tripId}/{filename}`, R2 keys are `{tripId}/{filename}`. Use `.replace("/api/photos/", "")`.

2. **Batch Deletion**: `DeleteObjectsCommand` is more efficient than multiple `DeleteObjectCommand` calls for trip deletion.

3. **Error Handling**: R2 operations should log failures but not fail the HTTP request. Database is the source of truth.

4. **Stream Conversion**: R2's `GetObjectCommand` returns a ReadableStream. Must convert to Buffer for Hono Response.

5. **Graceful Fallback**: When R2 not configured, fall back to local filesystem for development.

6. **Sharp Integration**: Extract image dimensions during upload (resolves TODO from line 82).

7. **Cache Headers**: Must maintain `public, max-age=31536000, immutable` on served images.

### Environment Variable Handling

- **Required for production**: All 4 R2 env vars
- **Optional for local dev**: Falls back to local filesystem
- **Test environment**: Mock R2 in tests (don't require real credentials)

### Data Migration

No data migration needed - this is a new app with no production data yet. Fresh start with R2.

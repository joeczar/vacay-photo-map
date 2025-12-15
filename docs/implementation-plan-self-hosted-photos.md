# Implementation Plan: Self-Hosted Photo Storage

Migrate from Cloudinary to local filesystem storage.

## Overview

| Current | Target |
|---------|--------|
| Photos uploaded to Cloudinary | Photos uploaded to API |
| URLs point to Cloudinary CDN | Files served from local disk via API |
| Cloudinary generates thumbnails | Sharp generates thumbnails server-side |

## Storage Structure

```
/data/photos/
  /{tripId}/
    {photoId}.jpg           # Original (resized to 1600px client-side)
    {photoId}_thumb.jpg     # 400x400 thumbnail (generated server-side)
```

## API Endpoints (New)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/trips/:id/photos/upload` | Admin | Upload photos with multipart/form-data |
| GET | `/api/photos/:tripId/:filename` | Public | Serve photo files with caching |

## Commits

### 1. Add sharp and storage utilities to API

**Files:**
- `api/package.json` - Add `sharp` dependency
- `api/src/utils/storage.ts` - New file

**storage.ts exports:**
```typescript
const DATA_DIR = process.env.DATA_DIR || '/data/photos'

export function getPhotoDir(tripId: string): string
export function getPhotoPath(tripId: string, photoId: string, variant: 'original' | 'thumb'): string
export async function ensurePhotoDir(tripId: string): Promise<void>
```

---

### 2. Create photo upload endpoint

**Files:**
- `api/src/routes/photos.ts` - New route file
- `api/src/index.ts` - Register photos route

**Endpoint**: `POST /api/trips/:id/photos/upload`

Request: `multipart/form-data`
- `files[]` - Image files
- `metadata` - JSON string with EXIF data per file

Response:
```json
{
  "photos": [
    {
      "id": "uuid",
      "storagePath": "tripId/photoId.jpg",
      "url": "/api/photos/tripId/photoId.jpg",
      "thumbnailUrl": "/api/photos/tripId/photoId_thumb.jpg",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "takenAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Processing per file:**
1. Generate UUID for photoId
2. Save original to `{tripId}/{photoId}.jpg`
3. Generate 400x400 thumbnail with sharp
4. Insert record into photos table
5. Return photo data

---

### 3. Add static file serving for photos

**Files:**
- `api/src/routes/photos.ts` - Add GET route

**Endpoint**: `GET /api/photos/:tripId/:filename`

Headers:
```
Content-Type: image/jpeg
Cache-Control: public, max-age=31536000, immutable
```

---

### 4. Update database schema

**Files:**
- `api/src/db/schema.sql` - Add column
- `api/src/db/migrations/003_storage_path.sql` - New migration
- `api/src/routes/trips.ts` - Update types

**Migration:**
```sql
ALTER TABLE photos ADD COLUMN storage_path TEXT;
-- Keep cloudinary_public_id for backward compatibility during transition
```

---

### 5. Create frontend upload service

**Files:**
- `app/src/lib/upload.ts` - New file

```typescript
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface PhotoMetadata {
  latitude: number | null
  longitude: number | null
  takenAt: string
  caption: string | null
}

export interface UploadResult {
  id: string
  storagePath: string
  url: string
  thumbnailUrl: string
}

export async function uploadPhotos(
  tripId: string,
  files: File[],
  metadata: PhotoMetadata[],
  onProgress?: (fileIndex: number, progress: UploadProgress) => void
): Promise<UploadResult[]>
```

Uses XHR for upload progress tracking (fetch doesn't support upload progress).

---

### 6. Update AdminView upload flow

**Files:**
- `app/src/views/AdminView.vue`

**Current flow:**
```
extractExif → resize → uploadToCloudinary → createTrip → createPhotos
```

**New flow:**
```
extractExif → resize → createTrip → uploadPhotos(tripId, files, metadata)
```

Key change: Create trip FIRST to get tripId, then upload photos.

---

### 7. Update image URL helpers

**Files:**
- `app/src/utils/image.ts`

**Replace Cloudinary functions with:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function getPhotoUrl(storagePath: string): string {
  return `${API_URL}/api/photos/${storagePath}`
}

export function getThumbnailUrl(storagePath: string): string {
  const [tripId, filename] = storagePath.split('/')
  const thumbFilename = filename.replace('.jpg', '_thumb.jpg')
  return `${API_URL}/api/photos/${tripId}/${thumbFilename}`
}

// Simplified srcset - serve original, let browser handle sizing
export function buildSrcSet(url: string): string {
  return '' // No srcset needed for self-hosted
}
```

---

### 8. Update TripView for self-hosted URLs

**Files:**
- `app/src/views/TripView.vue`

Replace:
- `photo.url` → `getPhotoUrl(photo.storage_path)`
- `photo.thumbnail_url` → `getThumbnailUrl(photo.storage_path)`
- Remove Cloudinary srcset transforms

---

### 9. Update database.ts types

**Files:**
- `app/src/utils/database.ts`

Update interfaces:
```typescript
interface ApiPhotoResponse {
  id: string
  tripId: string
  storagePath: string  // NEW
  // cloudinaryPublicId: string  // DEPRECATED
  url: string
  thumbnailUrl: string
  // ... rest unchanged
}
```

---

### 10. Docker volume configuration

**Files:**
- `docker-compose.yml`
- `docker-compose.dev.yml`

```yaml
services:
  api:
    volumes:
      - photo_data:/data/photos

volumes:
  photo_data:
```

For dev, mount local directory:
```yaml
services:
  api:
    volumes:
      - ./data/photos:/data/photos
```

---

### 11. Remove Cloudinary dependencies

**Files to delete:**
- `app/src/lib/cloudinary.ts`

**Files to update:**
- `app/package.json` - Remove `cloudinary` dependency
- `app/.env.example` - Remove `VITE_CLOUDINARY_*` vars

---

## Critical Files Reference

| File | Action |
|------|--------|
| `api/src/routes/photos.ts` | Create (upload + serve) |
| `api/src/utils/storage.ts` | Create (fs helpers) |
| `app/src/lib/upload.ts` | Create (replaces cloudinary.ts) |
| `app/src/lib/cloudinary.ts` | Delete |
| `app/src/utils/image.ts` | Rewrite URL helpers |
| `app/src/views/AdminView.vue` | Update upload flow |
| `app/src/views/TripView.vue` | Update image sources |
| `app/src/utils/database.ts` | Update types |
| `docker-compose.yml` | Add volume |

## Technical Notes

1. **Sharp on Bun**: Use `bun add sharp` - works out of the box
2. **File size limit**: Configure Hono for ~20MB per file
3. **EXIF extraction**: Stays client-side (exifr library)
4. **Client resize**: Stays client-side (1600px max)
5. **API binding**: Bind to `0.0.0.0` for Tailscale access
6. **Backward compatibility**: Keep `cloudinary_public_id` column during transition

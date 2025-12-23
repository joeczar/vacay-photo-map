# Implementation Plan: Add rotation field to photos table

**Issue:** #121
**Branch:** `feature/issue-121-add-photo-rotation`
**Complexity:** Simple
**Total Commits:** 1

## Overview
Add a `rotation` INTEGER field to the photos table to support storing photo orientation metadata. This field will store rotation values in degrees (0, 90, 180, 270) and defaults to 0 for standard orientation. This is a foundation for issue #117 (Photo Rotation feature).

## Prerequisites
- [x] No dependencies - this is a pure schema change

## Architecture

### Database Schema Change
- Add `rotation` column to `photos` table
- Column type: `INTEGER DEFAULT 0 NOT NULL`
- Constraint: `CHECK (rotation IN (0, 90, 180, 270))`
- Idempotent implementation using DO block (safe to run multiple times)

### Data Flow
No data flow changes - this is schema-only. Future commits will:
1. Extract rotation from EXIF during upload
2. Store rotation value in database
3. Apply rotation in frontend display

## Atomic Commits

### Commit 1: Add rotation field to photos table
**Type:** feat
**Scope:** db
**Files:**
- `api/src/db/schema.sql` - Modify (lines 48-60)
- `app/src/lib/database.types.ts` - Modify (lines 78-117)
- `app/src/utils/database.ts` - Modify (lines 39-51, 100-113)
- `api/src/routes/trips.ts` - Modify (lines 29-41, 67-78, 172-184)

**Changes:**

1. **Schema SQL (`api/src/db/schema.sql`)**
   - Add idempotent DO block after photos table creation (after line 60)
   - Check if `rotation` column exists before adding
   - Add column with default value and CHECK constraint

   ```sql
   -- Photos
   CREATE TABLE IF NOT EXISTS photos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
     cloudinary_public_id TEXT NOT NULL,
     url TEXT NOT NULL,
     thumbnail_url TEXT NOT NULL,
     latitude DECIMAL(10, 8),
     longitude DECIMAL(11, 8),
     taken_at TIMESTAMPTZ NOT NULL,
     caption TEXT,
     album TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
   );

   -- Add rotation column (idempotent)
   DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'photos'
         AND column_name = 'rotation'
     ) THEN
       ALTER TABLE photos
         ADD COLUMN rotation INTEGER DEFAULT 0 NOT NULL;

       ALTER TABLE photos
         ADD CONSTRAINT photos_rotation_check
         CHECK (rotation IN (0, 90, 180, 270));
     END IF;
   END $$;
   ```

2. **Frontend Types (`app/src/lib/database.types.ts`)**
   - Add `rotation: number` to `photos.Row` (after line 89)
   - Add `rotation?: number` to `photos.Insert` (after line 102)
   - Add `rotation?: number` to `photos.Update` (after line 115)

   ```typescript
   photos: {
     Row: {
       id: string
       trip_id: string
       cloudinary_public_id: string
       url: string
       thumbnail_url: string
       latitude: number | null
       longitude: number | null
       taken_at: string
       caption: string | null
       album: string | null
       created_at: string
       rotation: number  // ADD THIS LINE
     }
     Insert: {
       id?: string
       trip_id: string
       cloudinary_public_id: string
       url: string
       thumbnail_url: string
       latitude?: number | null
       longitude?: number | null
       taken_at: string
       caption?: string | null
       album?: string | null
       created_at?: string
       rotation?: number  // ADD THIS LINE
     }
     Update: {
       id?: string
       trip_id?: string
       cloudinary_public_id?: string
       url?: string
       thumbnail_url?: string
       latitude?: number | null
       longitude?: number | null
       taken_at?: string
       caption?: string | null
       album?: string | null
       created_at?: string
       rotation?: number  // ADD THIS LINE
     }
   }
   ```

3. **Frontend Database Utils (`app/src/utils/database.ts`)**
   - Add `rotation: number` to `ApiPhotoResponse` interface (after line 49)
   - Add `rotation?: number` to `ApiPhotoInsert` interface (after line 65)
   - Add `rotation: apiPhoto.rotation` to `transformApiPhoto` function (after line 111)
   - Add `rotation: photo.rotation ?? 0` to `transformPhotoToApi` function (after line 77)

   ```typescript
   interface ApiPhotoResponse {
     id: string
     tripId: string
     cloudinaryPublicId: string
     url: string
     thumbnailUrl: string
     latitude: number | null
     longitude: number | null
     takenAt: string
     caption: string | null
     album: string | null
     createdAt: string
     rotation: number  // ADD THIS LINE
   }

   interface ApiPhotoInsert {
     cloudinaryPublicId: string
     url: string
     thumbnailUrl: string
     latitude: number | null
     longitude: number | null
     takenAt: string
     caption: string | null
     rotation?: number  // ADD THIS LINE
   }

   function transformPhotoToApi(photo: PhotoInsert): ApiPhotoInsert {
     return {
       cloudinaryPublicId: photo.cloudinary_public_id,
       url: photo.url,
       thumbnailUrl: photo.thumbnail_url,
       latitude: photo.latitude ?? null,
       longitude: photo.longitude ?? null,
       takenAt: photo.taken_at,
       caption: photo.caption ?? null,
       rotation: photo.rotation ?? 0  // ADD THIS LINE
     }
   }

   function transformApiPhoto(apiPhoto: ApiPhotoResponse): Photo {
     return {
       id: apiPhoto.id,
       trip_id: apiPhoto.tripId,
       cloudinary_public_id: apiPhoto.cloudinaryPublicId,
       url: apiPhoto.url,
       thumbnail_url: apiPhoto.thumbnailUrl,
       latitude: apiPhoto.latitude,
       longitude: apiPhoto.longitude,
       taken_at: apiPhoto.takenAt,
       caption: apiPhoto.caption,
       album: apiPhoto.album,
       created_at: apiPhoto.createdAt,
       rotation: apiPhoto.rotation  // ADD THIS LINE
     }
   }
   ```

4. **Backend API Types (`api/src/routes/trips.ts`)**
   - Add `rotation: number` to `DbPhoto` interface (after line 40)
   - Add `rotation: number` to `PhotoResponse` interface (after line 77)
   - Add `rotation: photo.rotation` to `toPhotoResponse` function (after line 183)
   - Add `rotation` to SELECT query in `buildTripWithPhotosResponse` (line 197)

   ```typescript
   interface DbPhoto {
     id: string;
     trip_id: string;
     cloudinary_public_id: string;
     url: string;
     thumbnail_url: string;
     latitude: string | null;
     longitude: string | null;
     taken_at: Date;
     caption: string | null;
     album: string | null;
     created_at: Date;
     rotation: number;  // ADD THIS LINE
   }

   interface PhotoResponse {
     id: string;
     cloudinaryPublicId: string;
     url: string;
     thumbnailUrl: string;
     latitude: number | null;
     longitude: number | null;
     takenAt: Date;
     caption: string | null;
     album: string | null;
     createdAt: Date;
     rotation: number;  // ADD THIS LINE
   }

   function toPhotoResponse(photo: DbPhoto): PhotoResponse {
     return {
       id: photo.id,
       cloudinaryPublicId: photo.cloudinary_public_id,
       url: photo.url,
       thumbnailUrl: photo.thumbnail_url,
       latitude: photo.latitude ? parseFloat(photo.latitude) : null,
       longitude: photo.longitude ? parseFloat(photo.longitude) : null,
       takenAt: photo.taken_at,
       caption: photo.caption,
       album: photo.album,
       createdAt: photo.created_at,
       rotation: photo.rotation,  // ADD THIS LINE
     };
   }

   // In buildTripWithPhotosResponse, update SELECT query (line 197-201):
   const photos = await db<DbPhoto[]>`
     SELECT id, trip_id, cloudinary_public_id, url, thumbnail_url,
            latitude, longitude, taken_at, caption, album, created_at, rotation
     FROM photos
     WHERE trip_id = ${trip.id}
     ORDER BY taken_at ASC
   `;
   ```

**Acceptance Criteria:**
- [ ] Migration runs successfully: `cd api && bun run migrate`
- [ ] Schema validation passes (DDL-only check)
- [ ] New column appears with default value 0
- [ ] CHECK constraint prevents invalid values (test with psql if needed)
- [ ] Type check passes: `pnpm type-check`
- [ ] Build passes: `pnpm build`
- [ ] Existing photos default to rotation = 0
- [ ] Frontend types match backend schema

## Testing Strategy

### Manual Verification
1. **Run migration:**
   ```bash
   cd api
   bun run migrate
   ```

2. **Verify schema in database:**
   ```bash
   docker exec -it vacay-postgres psql -U vacay -d vacay -c "\d photos"
   ```

   Expected output should include:
   ```
   rotation | integer | not null default 0
   ```

   And constraint:
   ```
   "photos_rotation_check" CHECK (rotation = ANY (ARRAY[0, 90, 180, 270]))
   ```

3. **Test constraint enforcement (optional):**
   ```bash
   # This should fail with constraint violation
   docker exec -it vacay-postgres psql -U vacay -d vacay -c \
     "INSERT INTO photos (trip_id, cloudinary_public_id, url, thumbnail_url, taken_at, rotation)
      VALUES (gen_random_uuid(), 'test', 'test', 'test', NOW(), 45);"
   ```

4. **Verify existing data:**
   ```bash
   # All existing photos should have rotation = 0
   docker exec -it vacay-postgres psql -U vacay -d vacay -c \
     "SELECT id, rotation FROM photos LIMIT 5;"
   ```

5. **Type check:**
   ```bash
   pnpm type-check
   ```

6. **Build check:**
   ```bash
   pnpm build
   ```

### Automated Tests
No new tests required for this commit - pure schema change. Future commits in #117 will add:
- Unit tests for rotation extraction from EXIF
- Integration tests for photo creation with rotation
- E2E tests for rotation display in UI

## Verification Checklist

Before PR creation:
- [ ] Migration runs successfully without errors
- [ ] Database schema includes rotation column with correct type and constraint
- [ ] Existing photos have rotation = 0 (default value applied)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Build passes (`pnpm build`)
- [ ] No runtime errors in dev mode (`pnpm dev`)
- [ ] Frontend types match backend schema exactly

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration fails on existing database | DO block makes it idempotent - safe to re-run |
| Constraint too restrictive | Standard rotation values (0, 90, 180, 270) cover all valid EXIF orientations |
| Default value incorrect | 0 degrees is correct default (no rotation) for standard orientation |
| Type mismatch between layers | All layers use `number` type, backend enforces values via CHECK constraint |

## Open Questions

None - requirements are clear from the issue and parent issue #117.

## Notes

- This is a foundational change for #117 (Photo Rotation)
- The column is added but not yet populated with EXIF data - that's a future commit
- The CHECK constraint ensures data integrity at the database level
- The DO block pattern follows existing schema.sql conventions for idempotency
- All existing photos will automatically receive the default value (0) when the migration runs

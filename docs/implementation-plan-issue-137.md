# Implementation Plan: Add rotation, description, and sections schema

**Issue:** #137
**Branch:** `feature/issue-137-photo-sections-schema`
**Complexity:** Simple
**Total Commits:** 1

## Overview

Add schema support for photo organization features: rotation metadata, photo descriptions, and trip sections. This is a database-only change - no API/frontend modifications.

## Prerequisites

- [ ] PostgreSQL database accessible
- [ ] Database user `vacay` exists with appropriate permissions
- [ ] Current schema.sql has been applied to database

## Architecture

### Schema Changes

**New Table:**
- `sections` - Organizes photos into ordered groups within a trip

**Extended Photos Table:**
- `rotation` - Integer (0, 90, 180, 270) for display orientation
- `description` - Text field for photo captions/descriptions
- `section_id` - Foreign key to sections (nullable, SET NULL on delete)

**New Indexes:**
- `idx_sections_trip_id` - Fast lookups by trip
- `idx_sections_trip_order` - Efficient section ordering within trip
- `idx_photos_section_id` - Fast photo filtering by section

### Data Flow

```
Sections (optional grouping)
    ↓ (section_id FK, ON DELETE SET NULL)
Photos (existing)
    + rotation (0/90/180/270)
    + description (TEXT)
    + section_id (UUID NULL)
```

## Atomic Commits

### Commit 1: feat(schema): add rotation, description, and sections support

**Type:** feat
**Scope:** schema
**Files:**
- `api/src/db/schema.sql` - Modify

**Changes:**

**1. Add sections table (insert after trips table, before photos table ~ line 46)**

```sql
-- Sections (organize photos within trips)
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT sections_order_index_check CHECK (order_index >= 0)
);
```

**2. Add columns to photos table (insert in DO blocks after line 60, before indexes section)**

```sql
-- Add rotation column to photos table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'rotation'
  ) THEN
    ALTER TABLE photos
      ADD COLUMN rotation INTEGER DEFAULT 0 NOT NULL,
      ADD CONSTRAINT photos_rotation_check CHECK (rotation IN (0, 90, 180, 270));
  END IF;
END $$;

-- Add description column to photos table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE photos
      ADD COLUMN description TEXT;
  END IF;
END $$;

-- Add section_id column to photos table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'section_id'
  ) THEN
    ALTER TABLE photos
      ADD COLUMN section_id UUID REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
END $$;
```

**3. Add indexes (insert after existing photo indexes ~ line 67)**

```sql
CREATE INDEX IF NOT EXISTS idx_sections_trip_id ON sections(trip_id);
CREATE INDEX IF NOT EXISTS idx_sections_trip_order ON sections(trip_id, order_index);
CREATE INDEX IF NOT EXISTS idx_photos_section_id ON photos(section_id);
```

**4. Add updated_at trigger for sections (insert after trips trigger ~ line 89)**

```sql
DROP TRIGGER IF EXISTS trg_sections_set_updated_at ON sections;
CREATE TRIGGER trg_sections_set_updated_at
  BEFORE UPDATE ON sections
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

**5. Enable RLS for sections (insert after photos RLS enable ~ line 93)**

```sql
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
```

**6. Add RLS policies for sections (insert after photos policies ~ line 142)**

```sql
-- Sections inherit visibility from their parent trip
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sections'
      AND policyname = 'Sections of public trips are viewable'
  ) THEN
    CREATE POLICY "Sections of public trips are viewable"
      ON sections FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM trips
          WHERE trips.id = sections.trip_id
            AND trips.is_public = true
        )
      );
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow inserts from API user for sections" ON sections;
CREATE POLICY "Allow inserts from API user for sections"
  ON sections FOR INSERT
  WITH CHECK (current_user = 'vacay');
```

**Acceptance Criteria:**
- [ ] Schema changes apply successfully to fresh database
- [ ] Schema changes apply successfully to existing database (idempotent)
- [ ] All existing data remains intact
- [ ] New columns have correct defaults and constraints
- [ ] Foreign keys enforce referential integrity
- [ ] Indexes created successfully
- [ ] RLS policies active on sections table
- [ ] Trigger updates sections.updated_at on modification
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

## Testing Strategy

### Manual Verification Steps

**1. Apply to fresh database:**
```bash
cd api
docker compose down -v  # Clean slate
docker compose up -d
# Wait for init to complete
docker compose exec postgres psql -U vacay -d vacay -f /docker-entrypoint-initdb.d/schema.sql
```

**2. Verify schema:**
```sql
-- Check sections table exists
\d sections

-- Check photos columns
\d photos
-- Should show: rotation, description, section_id

-- Check indexes
\di
-- Should include: idx_sections_trip_id, idx_sections_trip_order, idx_photos_section_id

-- Check constraints
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'photos'::regclass;
-- Should include: photos_rotation_check

SELECT conname, contype FROM pg_constraint WHERE conrelid = 'sections'::regclass;
-- Should include: sections_order_index_check

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('sections');
-- Should include: "Sections of public trips are viewable", "Allow inserts from API user for sections"

-- Check triggers
SELECT tgname FROM pg_trigger WHERE tgrelid = 'sections'::regclass;
-- Should include: trg_sections_set_updated_at
```

**3. Test idempotency (apply twice):**
```bash
docker compose exec postgres psql -U vacay -d vacay -f /docker-entrypoint-initdb.d/schema.sql
docker compose exec postgres psql -U vacay -d vacay -f /docker-entrypoint-initdb.d/schema.sql
# Should complete without errors
```

**4. Test constraints:**
```sql
-- Test rotation constraint (should fail)
INSERT INTO trips (slug, title) VALUES ('test-trip', 'Test Trip');
INSERT INTO photos (trip_id, cloudinary_public_id, url, thumbnail_url, taken_at, rotation)
  SELECT id, 'test', 'http://test.jpg', 'http://test-thumb.jpg', NOW(), 45
  FROM trips WHERE slug = 'test-trip';
-- Expected: ERROR:  new row for relation "photos" violates check constraint "photos_rotation_check"

-- Test rotation constraint (should succeed)
INSERT INTO photos (trip_id, cloudinary_public_id, url, thumbnail_url, taken_at, rotation)
  SELECT id, 'test', 'http://test.jpg', 'http://test-thumb.jpg', NOW(), 90
  FROM trips WHERE slug = 'test-trip';
-- Expected: INSERT 0 1

-- Test section order constraint (should fail)
INSERT INTO sections (trip_id, title, order_index)
  SELECT id, 'Test Section', -1
  FROM trips WHERE slug = 'test-trip';
-- Expected: ERROR:  new row for relation "sections" violates check constraint "sections_order_index_check"

-- Test section FK and ON DELETE SET NULL
INSERT INTO sections (trip_id, title, order_index)
  SELECT id, 'Test Section', 0
  FROM trips WHERE slug = 'test-trip';

UPDATE photos SET section_id = (SELECT id FROM sections LIMIT 1);
DELETE FROM sections;
SELECT section_id FROM photos;
-- Expected: section_id should be NULL

-- Cleanup
DELETE FROM photos;
DELETE FROM trips;
```

**5. Test RLS policies:**
```sql
-- Create test data as vacay user
INSERT INTO trips (slug, title, is_public) VALUES ('public-trip', 'Public Trip', true);
INSERT INTO trips (slug, title, is_public) VALUES ('private-trip', 'Private Trip', false);
INSERT INTO sections (trip_id, title, order_index)
  SELECT id, 'Public Section', 0 FROM trips WHERE slug = 'public-trip';
INSERT INTO sections (trip_id, title, order_index)
  SELECT id, 'Private Section', 0 FROM trips WHERE slug = 'private-trip';

-- Test SELECT policy (switch to readonly user if available, or test via app)
-- Public sections should be visible, private sections hidden

-- Cleanup
DELETE FROM sections;
DELETE FROM trips;
```

### Automated Tests

No new automated tests required for this commit - schema validation occurs during manual testing. Future commits adding API endpoints will include integration tests.

## Verification Checklist

Before PR creation:
- [ ] Schema applies cleanly to fresh database
- [ ] Schema applies idempotently to existing database
- [ ] All constraints tested and working
- [ ] Foreign key CASCADE/SET NULL behavior verified
- [ ] RLS policies verified
- [ ] Triggers verified (updated_at)
- [ ] Manual verification SQL ran successfully
- [ ] No breaking changes to existing data

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Constraint violations on existing data | DO blocks prevent re-adding columns; rotation defaults to 0 (valid); description/section_id allow NULL |
| Index creation on large tables | CREATE INDEX IF NOT EXISTS is non-blocking; indexes created at startup when table is empty |
| RLS policy conflicts | Use DO blocks for conditional CREATE, DROP/CREATE pattern for insert policies |
| Foreign key deadlocks | ON DELETE SET NULL prevents cascading deletes from blocking; section deletions are rare |

## Open Questions

None - requirements are clear from issue #137.

## Post-Implementation

**This PR completes:**
- Schema foundation for photo rotation UI
- Schema foundation for photo descriptions
- Schema foundation for trip sections/organization

**Follow-up work (separate issues):**
- API endpoints for sections CRUD
- API endpoints for photo updates (rotation, description, section_id)
- Frontend UI for managing sections
- Frontend UI for rotating photos
- Frontend UI for editing photo descriptions
- Migration of existing photos to sections (if default section desired)

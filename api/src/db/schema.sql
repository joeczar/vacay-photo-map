-- =============================================================================
-- DEPRECATED: This file is kept for reference only.
--
-- DO NOT MODIFY THIS FILE FOR SCHEMA CHANGES.
--
-- Schema changes should be made via numbered migrations in api/migrations/
-- See api/migrations/README.md for the migration workflow.
--
-- This file represents the original schema before the migration system was
-- implemented. It may drift from the actual database schema over time.
--
-- Related: Issue #229 (migration system implementation)
-- =============================================================================

-- Vacay Photo Map self-hosted schema (Postgres 15+)
-- Safe to run multiple times; used by docker-compose init and migration script
--
-- NOTE: This schema intentionally diverges from the Supabase-hosted version:
-- - Uses password authentication with bcrypt hashing
-- - Supabase version uses Supabase Auth service instead
-- - See issue #55 for migration context

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Migration: Drop deprecated tables from WebAuthn-based auth
-- Safe to run multiple times (DROP IF EXISTS is idempotent)
-- =============================================================================
DROP TABLE IF EXISTS authenticators;

-- Users/Auth
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Migration: Add password_hash for password authentication (#227, #229)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN password_hash TEXT;
  END IF;
END $$;

-- Set NOT NULL constraint after column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'password_hash'
      AND is_nullable = 'YES'
  ) THEN
    -- Ensure all existing rows have a value before adding constraint
    UPDATE user_profiles SET password_hash = '' WHERE password_hash IS NULL;
    ALTER TABLE user_profiles ALTER COLUMN password_hash SET NOT NULL;
  END IF;
END $$;

-- Trips
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  access_token_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Sections (organize photos within trips)
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT sections_order_index_check CHECK (order_index >= 0),
  UNIQUE (trip_id, order_index)
);

-- Photos
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  taken_at TIMESTAMPTZ NOT NULL,
  caption TEXT,
  album TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

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

-- Rename cloudinary_public_id to storage_key (migration from Cloudinary to R2)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'cloudinary_public_id'
  ) THEN
    ALTER TABLE photos RENAME COLUMN cloudinary_public_id TO storage_key;
  END IF;
END $$;

-- Ensure storage_key has NOT NULL constraint (align with table definition)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos'
      AND column_name = 'storage_key'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE photos ALTER COLUMN storage_key SET NOT NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_photos_trip_id ON photos(trip_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_photos_trip_taken ON photos(trip_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_trips_slug ON trips(slug);
CREATE INDEX IF NOT EXISTS idx_sections_trip_order ON sections(trip_id, order_index);
CREATE INDEX IF NOT EXISTS idx_photos_section_id ON photos(section_id);

-- Update updated_at timestamps automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_set_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_trips_set_updated_at ON trips;
CREATE TRIGGER trg_trips_set_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sections_set_updated_at ON sections;
CREATE TRIGGER trg_sections_set_updated_at
  BEFORE UPDATE ON sections
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Enable Row Level Security
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent)
-- INSERT policies restrict to the API database user ('vacay') for defense-in-depth.
-- Application layer enforces JWT-based admin auth via requireAdmin middleware.
-- Direct database access (e.g., psql, scripts) must connect as the 'vacay' user.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trips'
      AND policyname = 'Public trips are viewable by everyone'
  ) THEN
    CREATE POLICY "Public trips are viewable by everyone"
      ON trips FOR SELECT
      USING (is_public = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'photos'
      AND policyname = 'Photos of public trips are viewable'
  ) THEN
    CREATE POLICY "Photos of public trips are viewable"
      ON photos FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM trips
          WHERE trips.id = photos.trip_id
            AND trips.is_public = true
        )
      );
  END IF;
END $$;

-- Drop old/current policies and recreate to ensure latest definition is applied
DROP POLICY IF EXISTS "Allow all inserts for trips" ON trips;
DROP POLICY IF EXISTS "Allow inserts from API user for trips" ON trips;
CREATE POLICY "Allow inserts from API user for trips"
  ON trips FOR INSERT
  WITH CHECK (current_user = 'vacay');

DROP POLICY IF EXISTS "Allow all inserts for photos" ON photos;
DROP POLICY IF EXISTS "Allow inserts from API user for photos" ON photos;
CREATE POLICY "Allow inserts from API user for photos"
  ON photos FOR INSERT
  WITH CHECK (current_user = 'vacay');

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

-- =============================================================================
-- RBAC (Role-Based Access Control) for Trip Access
-- =============================================================================

-- Invitations for trip access
-- An invite grants access to one or more trips with a specific role
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Junction table: which trips an invite grants access to
CREATE TABLE IF NOT EXISTS invite_trip_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES invites(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(invite_id, trip_id)
);

-- User permissions for specific trips
-- This is the source of truth for who can access what trip with what role
-- Admins (user_profiles.is_admin = true) bypass this table entirely
CREATE TABLE IF NOT EXISTS trip_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  granted_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  UNIQUE(user_id, trip_id)
);

-- RBAC Indexes
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invite_trip_access_invite ON invite_trip_access(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_trip_access_trip ON invite_trip_access(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_access_user ON trip_access(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_access_trip ON trip_access(trip_id);
-- Note: No composite index needed - UNIQUE(user_id, trip_id) constraint already creates one

-- RBAC Triggers
DROP TRIGGER IF EXISTS trg_invites_set_updated_at ON invites;
CREATE TRIGGER trg_invites_set_updated_at
  BEFORE UPDATE ON invites
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Enable RLS on RBAC tables
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_trip_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_access ENABLE ROW LEVEL SECURITY;

-- RLS policies for RBAC tables
-- Strategy: Only INSERT policies are defined here. The 'vacay' DB user (used by the API)
-- is a table owner and bypasses RLS for SELECT/UPDATE/DELETE operations.
-- Access control is enforced at the application layer via middleware (checkTripAccess).
-- This approach provides defense-in-depth while keeping RLS policies simple.
DROP POLICY IF EXISTS "Allow inserts from API user for invites" ON invites;
CREATE POLICY "Allow inserts from API user for invites"
  ON invites FOR INSERT
  WITH CHECK (current_user = 'vacay');

DROP POLICY IF EXISTS "Allow inserts from API user for invite_trip_access" ON invite_trip_access;
CREATE POLICY "Allow inserts from API user for invite_trip_access"
  ON invite_trip_access FOR INSERT
  WITH CHECK (current_user = 'vacay');

DROP POLICY IF EXISTS "Allow inserts from API user for trip_access" ON trip_access;
CREATE POLICY "Allow inserts from API user for trip_access"
  ON trip_access FOR INSERT
  WITH CHECK (current_user = 'vacay');

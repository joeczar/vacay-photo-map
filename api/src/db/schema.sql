-- Vacay Photo Map self-hosted schema (Postgres 15+)
-- Safe to run multiple times; used by docker-compose init and migration script
--
-- NOTE: This schema intentionally diverges from the Supabase-hosted version:
-- - Uses WebAuthn/passkeys for authentication (no passwords)
-- - Supabase version uses Supabase Auth service instead
-- - See issue #55 for migration context

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users/Auth
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  webauthn_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- WebAuthn authenticators (passkeys)
CREATE TABLE IF NOT EXISTS authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0 NOT NULL,
  transports TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMPTZ
);

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_trip_id ON photos(trip_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_photos_trip_taken ON photos(trip_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_trips_slug ON trips(slug);

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

-- Enable Row Level Security
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

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

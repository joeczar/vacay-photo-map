-- Vacay Photo Map Database Schema
-- This file is idempotent - safe to run multiple times
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_url TEXT,
  slug TEXT UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add access_token_hash column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'trips'
    AND column_name = 'access_token_hash'
  ) THEN
    ALTER TABLE trips ADD COLUMN access_token_hash TEXT;
    COMMENT ON COLUMN trips.access_token_hash IS 'Bcrypt hash of the access token for private trips. NULL for public trips.';
  END IF;
END $$;

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  cloudinary_public_id TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  taken_at TIMESTAMPTZ NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance (IF NOT EXISTS requires Postgres 9.5+)
CREATE INDEX IF NOT EXISTS idx_photos_trip_id ON photos(trip_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_trips_slug ON trips(slug);

-- Enable Row Level Security (safe to run multiple times)
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies (with conditional creation)
-- Note: CREATE POLICY IF NOT EXISTS is only available in Postgres 15+
-- Using DO blocks for compatibility

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
    AND policyname = 'Photos are viewable by everyone'
  ) THEN
    CREATE POLICY "Photos are viewable by everyone"
      ON photos FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trips'
    AND policyname = 'Allow all inserts for trips'
  ) THEN
    CREATE POLICY "Allow all inserts for trips"
      ON trips FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'photos'
    AND policyname = 'Allow all inserts for photos'
  ) THEN
    CREATE POLICY "Allow all inserts for photos"
      ON photos FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

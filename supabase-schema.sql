-- Vacay Photo Map Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trips table
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_url TEXT,
  slug TEXT UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos table
CREATE TABLE photos (
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

-- Indexes for performance
CREATE INDEX idx_photos_trip_id ON photos(trip_id);
CREATE INDEX idx_photos_taken_at ON photos(taken_at);
CREATE INDEX idx_trips_slug ON trips(slug);

-- Enable Row Level Security
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow public read for now - we'll add password protection later)
CREATE POLICY "Public trips are viewable by everyone"
  ON trips FOR SELECT
  USING (is_public = true);

CREATE POLICY "Photos are viewable by everyone"
  ON photos FOR SELECT
  USING (true);

-- For now, allow all inserts (we'll add auth later)
CREATE POLICY "Allow all inserts for trips"
  ON trips FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all inserts for photos"
  ON photos FOR INSERT
  WITH CHECK (true);

-- Seed data for local development
-- Inserts one admin user, a sample trip, and a photo if they do not already exist
-- NOTE: Admin user is created without a passkey - register one via the UI

WITH admin_user AS (
  INSERT INTO user_profiles (email, display_name, is_admin)
  VALUES (
    'admin@example.com',
    'Admin User',
    TRUE
  )
  ON CONFLICT (email) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    is_admin = EXCLUDED.is_admin
  RETURNING id
),
trip_upsert AS (
  INSERT INTO trips (title, description, cover_photo_url, slug, is_public)
  VALUES (
    'Amsterdam Adventure',
    'Sample trip seeded for local dev',
    'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    'amsterdam-adventure',
    true
  )
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id
),
trip_id_source AS (
  SELECT id FROM trip_upsert
  UNION ALL
  SELECT id FROM trips WHERE slug = 'amsterdam-adventure' LIMIT 1
)
INSERT INTO photos (
  trip_id,
  cloudinary_public_id,
  url,
  thumbnail_url,
  latitude,
  longitude,
  taken_at,
  caption
)
SELECT
  (SELECT id FROM trip_id_source LIMIT 1),
  'seed-cover',
  'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  'https://res.cloudinary.com/demo/image/upload/w_400/sample.jpg',
  52.3676,
  4.9041,
  NOW() - INTERVAL '10 days',
  'Bike ride along the canals'
WHERE NOT EXISTS (
  SELECT 1 FROM photos WHERE cloudinary_public_id = 'seed-cover'
);

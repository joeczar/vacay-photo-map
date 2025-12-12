-- Seed data for local development
-- Inserts one sample trip and photo if they do not already exist

WITH trip_upsert AS (
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

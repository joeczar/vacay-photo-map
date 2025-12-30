import { closeDbClient, getDbClient } from '../src/db/client'

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
const adminName = process.env.SEED_ADMIN_NAME || 'Admin User'
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme123'

const seed = async () => {
  const db = getDbClient()

  console.info('Seeding database with admin user and sample data...')

  // Hash password
  const passwordHash = await Bun.password.hash(adminPassword)

  const [user] =
    await db`INSERT INTO user_profiles (email, password_hash, display_name, is_admin)
             VALUES (${adminEmail}, ${passwordHash}, ${adminName}, TRUE)
             ON CONFLICT (email) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 is_admin = EXCLUDED.is_admin,
                 password_hash = EXCLUDED.password_hash
             RETURNING id`

  const [trip] =
    await db`INSERT INTO trips (title, description, cover_photo_url, slug, is_public)
             VALUES (
               'Amsterdam Adventure',
               'Sample trip seeded for local dev',
               'https://res.cloudinary.com/demo/image/upload/sample.jpg',
               'amsterdam-adventure',
               TRUE
             )
             ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
             RETURNING id`

  await db`
    INSERT INTO photos (
      trip_id,
      storage_key,
      url,
      thumbnail_url,
      latitude,
      longitude,
      taken_at,
      caption
    )
    SELECT
      ${trip.id},
      'seed-cover',
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      'https://res.cloudinary.com/demo/image/upload/w_400/sample.jpg',
      52.3676,
      4.9041,
      NOW() - INTERVAL '10 days',
      'Bike ride along the canals'
    WHERE NOT EXISTS (
      SELECT 1 FROM photos WHERE storage_key = 'seed-cover'
    )
  `

  console.info(
    `Seed complete. Admin: ${adminEmail} (user id: ${user.id}), trip id: ${trip.id}`
  )
}

seed()
  .catch((error) => {
    console.error(
      'Seed failed:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbClient()
  })

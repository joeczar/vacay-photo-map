import { closeDbClient, getDbClient } from '../src/db/client'

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
const adminName = process.env.SEED_ADMIN_NAME || 'Admin User'

// Generate a random WebAuthn user ID (base64url encoded)
function generateWebAuthnUserId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

const seed = async () => {
  const db = getDbClient()

  console.info('Seeding database with admin user and sample data...')
  console.info('Note: Admin user has no passkey yet - register one via the UI')

  const webauthnUserId = generateWebAuthnUserId()

  const [user] =
    await db`INSERT INTO user_profiles (email, webauthn_user_id, display_name, is_admin)
             VALUES (${adminEmail}, ${webauthnUserId}, ${adminName}, TRUE)
             ON CONFLICT (email) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 is_admin = EXCLUDED.is_admin
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

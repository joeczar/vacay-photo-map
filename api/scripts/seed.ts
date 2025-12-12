import bcrypt from 'bcrypt'
import { closeDbClient, getDbClient } from '../src/db/client'

const MIN_PASSWORD_LENGTH = 8

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123'
const adminName = process.env.SEED_ADMIN_NAME || 'Admin User'

/**
 * Validate seed configuration before running
 */
function validateConfig(): void {
  if (adminPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters ` +
        `(got ${adminPassword.length}). Set a stronger password in your environment.`
    )
  }

  // Warn if using default credentials
  if (
    adminEmail === 'admin@example.com' &&
    adminPassword === 'admin123' &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'Cannot use default credentials in production. ' +
        'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables.'
    )
  }
}

const parseSaltRounds = (): number => {
  const value = process.env.BCRYPT_SALT_ROUNDS
  const parsed = value ? Number.parseInt(value, 10) : 14
  if (parsed < 10 || parsed > 20) {
    throw new Error('BCRYPT_SALT_ROUNDS must be between 10 and 20')
  }
  return parsed
}

const seed = async () => {
  validateConfig()
  const db = getDbClient()

  console.info('Seeding database with admin user and sample data...')
  const passwordHash = await bcrypt.hash(adminPassword, parseSaltRounds())

  const [user] =
    await db`INSERT INTO user_profiles (email, password_hash, display_name, is_admin)
             VALUES (${adminEmail}, ${passwordHash}, ${adminName}, TRUE)
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
      cloudinary_public_id,
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
      SELECT 1 FROM photos WHERE cloudinary_public_id = 'seed-cover'
    )
  `

  console.info(
    `Seed complete. Admin: ${adminEmail} (user id: ${user.id}), trip id: ${trip.id}`
  )
}

seed()
  .catch((error) => {
    // Log only error message to avoid exposing connection details or sensitive data
    console.error(
      'Seed failed:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbClient()
  })

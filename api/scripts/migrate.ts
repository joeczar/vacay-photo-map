import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'postgres-migrations'
import { closeDbClient, connectWithRetry, getDbClient } from '../src/db/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'migrations')

/**
 * Create a postgres-migrations compatible client adapter
 * The library expects node-postgres (pg) client interface, but we use postgres.js
 * This adapter maps our client's methods to the expected interface
 */
function createMigrationClient(db: ReturnType<typeof getDbClient>) {
  return {
    query: async (sql: string, values?: unknown[]) => {
      const result = values
        ? await db.unsafe(sql, values as any[])
        : await db.unsafe(sql)
      return {
        rows: result,
        rowCount: result.length,
      }
    },
  }
}

const runMigrations = async () => {
  // Wait for database to be available (handles container startup ordering)
  await connectWithRetry(5, 2000)

  const db = getDbClient()
  const client = createMigrationClient(db)

  console.info(`Running migrations from ${migrationsDir}...`)

  try {
    // Run all pending migrations
    // postgres-migrations handles:
    // - Tracking applied migrations in 'migrations' table
    // - Running migrations in order
    // - Advisory locks to prevent concurrent migrations
    const appliedMigrations = await migrate({ client: client as any }, migrationsDir)

    if (appliedMigrations.length > 0) {
      console.info(`Applied ${appliedMigrations.length} migration(s):`)
      for (const m of appliedMigrations) {
        console.info(`  - ${m.name}`)
      }
    } else {
      console.info('No pending migrations to apply.')
    }

    // Verify critical tables exist
    const verification = await db`
      SELECT
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_profiles') as has_users,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'trips') as has_trips,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'photos') as has_photos
    `
    const result = verification[0]
    if (!result?.has_users || !result?.has_trips || !result?.has_photos) {
      throw new Error('Migration verification failed: required tables not found')
    }

    console.info('Migrations completed and verified successfully.')
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}

runMigrations()
  .then(async () => {
    await closeDbClient()
  })
  .catch(async (error) => {
    console.error('Migration error:', error)
    await closeDbClient().catch(() => {})
    process.exit(1)
  })

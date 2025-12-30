import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'postgres-migrations'
import { closeDbClient, connectWithRetry, getDbClient } from '../../src/db/client'
import { createMigrationClient } from '../../src/db/migration-client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', '..', 'migrations')

describe('Database Migrations', () => {
  beforeAll(async () => {
    await connectWithRetry(5, 2000)
  })

  afterAll(async () => {
    await closeDbClient()
  })

  it('runs all migrations successfully', async () => {
    const db = getDbClient()
    const client = createMigrationClient(db)

    // Should not throw
    await migrate({ client: client as any }, migrationsDir)

    // Verify migrations table exists (created by postgres-migrations)
    const [result] = await db`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'migrations'
      ) as exists
    `
    expect(result.exists).toBe(true)
  })

  it('creates all expected tables', async () => {
    const db = getDbClient()
    const expectedTables = [
      'user_profiles',
      'trips',
      'sections',
      'photos',
      'invites',
      'invite_trip_access',
      'trip_access',
    ]

    for (const tableName of expectedTables) {
      const [result] = await db`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = ${tableName}
        ) as exists
      `
      expect(result.exists).toBe(true)
    }
  })

  it('creates password_hash column with NOT NULL constraint', async () => {
    const db = getDbClient()
    const [result] = await db`
      SELECT
        column_name,
        is_nullable,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'user_profiles'
        AND column_name = 'password_hash'
    `

    expect(result).toBeDefined()
    expect(result.column_name).toBe('password_hash')
    expect(result.is_nullable).toBe('NO')
    expect(result.data_type).toBe('text')
  })

  it('is idempotent (running twice does not fail)', async () => {
    const db = getDbClient()
    const client = createMigrationClient(db)

    // Run migrations again - should be no-op since all are already applied
    await migrate({ client: client as any }, migrationsDir)

    // Should still have all tables
    const [result] = await db`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_profiles'
      ) as exists
    `
    expect(result.exists).toBe(true)
  })

  it('tracks migrations in migrations table', async () => {
    const db = getDbClient()

    // Check that migrations are tracked
    const migrations = await db`
      SELECT name FROM migrations ORDER BY id
    `

    // Should have at least the initial schema migration
    // Note: postgres-migrations creates a 'create-migrations-table' entry first
    // and strips the number prefix from migration names
    expect(migrations.length).toBeGreaterThanOrEqual(2)
    expect(migrations.some(m => m.name === 'initial-schema')).toBe(true)
  })
})

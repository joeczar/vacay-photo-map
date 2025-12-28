import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDbClient, connectWithRetry, getDbClient } from '../src/db/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql')

/**
 * Validate that schema SQL only contains DDL statements (no DML)
 * Prevents accidental execution of INSERT/UPDATE/DELETE outside functions
 *
 * This is a safeguard, not a full SQL parser. It removes comments and
 * PL/pgSQL blocks before checking for forbidden DML statements.
 *
 * Note: This specifically matches DML syntax patterns, not DDL clauses like
 * "ON DELETE CASCADE" or "BEFORE UPDATE ON" which are valid in schemas.
 */
function validateSchemaSql(sql: string): void {
  // Match actual DML statements, not DDL clauses containing these keywords
  // - INSERT INTO ... (DML)
  // - DELETE FROM ... (DML)
  // - UPDATE table SET ... (DML)
  const dmlPatterns = [
    /\bINSERT\s+INTO\b/gi,
    /\bDELETE\s+FROM\b/gi,
    /\bUPDATE\s+\w+\s+SET\b/gi,
  ]

  // Remove comments and PL/pgSQL blocks to avoid false positives
  const sanitizedSql = sql
    .replace(/--.*$/gm, '') // remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove multi-line comments
    .replace(/\$\$[\s\S]*?\$\$/g, '') // remove PL/pgSQL blocks

  const foundDml: string[] = []
  for (const pattern of dmlPatterns) {
    const matches = sanitizedSql.match(pattern)
    if (matches) {
      foundDml.push(...matches)
    }
  }

  if (foundDml.length > 0) {
    throw new Error(
      `Schema validation failed: DML statement(s) (${foundDml.join(', ')}) ` +
        `found outside a function or DO block.`
    )
  }
}

const migrate = async () => {
  // Wait for database to be available (handles container startup ordering)
  await connectWithRetry(5, 2000)

  const db = getDbClient()
  const schemaSql = await readFile(schemaPath, 'utf8')

  console.info(`Applying schema from ${schemaPath}...`)

  // Validate SQL before execution
  validateSchemaSql(schemaSql)

  // Execute within a transaction for atomicity
  await db.begin(async (tx) => {
    await tx.unsafe(schemaSql)
  })

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

  console.info('Schema applied and verified successfully.')
}

migrate()
  .then(() => {
    console.info('Migration completed successfully')
  })
  .catch(async (error) => {
    console.error('Migration failed:', error)
    // Clean up before exiting
    try {
      await closeDbClient()
    } catch {
      // Ignore cleanup errors to preserve original error
    }
    process.exit(1)
  })
  .finally(async () => {
    // Clean up on success path
    try {
      await closeDbClient()
    } catch (cleanupError) {
      console.error('Warning: Error during database cleanup:', cleanupError)
    }
  })

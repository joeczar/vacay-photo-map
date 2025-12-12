import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDbClient, getDbClient } from '../src/db/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql')

// Allowed DDL keywords for schema files (security validation)
const ALLOWED_DDL_PATTERN =
  /^(CREATE|ALTER|DROP|DO|GRANT|REVOKE|COMMENT|SET)\s/gim

/**
 * Validate that schema SQL only contains expected DDL statements
 * Prevents accidental execution of DML (INSERT/UPDATE/DELETE) or dangerous commands
 */
function validateSchemaSql(sql: string): void {
  // Remove comments and empty lines for validation
  const statements = sql
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    // Skip pure PL/pgSQL blocks (BEGIN...END)
    if (/^\$\$/.test(stmt) || /^END/.test(stmt)) continue

    // Check statement starts with allowed DDL keyword
    if (!ALLOWED_DDL_PATTERN.test(stmt)) {
      // Allow statements that are continuations of DO blocks
      if (!/^(BEGIN|DECLARE|IF|THEN|ELSE|END|RETURN|NEW|SELECT\s+1)/.test(stmt)) {
        throw new Error(
          `Schema validation failed: unexpected statement type.\n` +
            `Statement: ${stmt.slice(0, 100)}...`
        )
      }
    }
    // Reset regex lastIndex for next iteration
    ALLOWED_DDL_PATTERN.lastIndex = 0
  }
}

const migrate = async () => {
  const db = getDbClient()
  const schemaSql = await readFile(schemaPath, 'utf8')

  console.info(`Applying schema from ${schemaPath}...`)

  // Validate SQL before execution
  validateSchemaSql(schemaSql)

  await db.unsafe(schemaSql)
  console.info('Schema applied successfully.')
}

migrate()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbClient()
  })

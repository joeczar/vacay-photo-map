import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDbClient, getDbClient } from '../src/db/client'

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

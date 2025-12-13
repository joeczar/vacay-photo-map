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
 */
function validateSchemaSql(sql: string): void {
  const forbiddenDmlPattern = /\b(INSERT|UPDATE|DELETE)\b/gi

  // Remove comments and PL/pgSQL blocks to avoid false positives
  const sanitizedSql = sql
    .replace(/--.*$/gm, '') // remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove multi-line comments
    .replace(/\$\$[\s\S]*?\$\$/g, '') // remove PL/pgSQL blocks

  const matches = sanitizedSql.match(forbiddenDmlPattern)
  if (matches) {
    throw new Error(
      `Schema validation failed: DML statement(s) (${matches.join(', ')}) ` +
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

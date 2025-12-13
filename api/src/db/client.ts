import postgres from 'postgres'

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }

  return url
}

const getSslConfig = () => {
  const useSsl =
    process.env.DATABASE_SSL === '1' ||
    process.env.DATABASE_SSL?.toLowerCase() === 'true'

  if (!useSsl) {
    return false
  }

  // Defaults to true for security (validates server certificate)
  // Set DATABASE_SSL_REJECT_UNAUTHORIZED=false only for local dev with self-signed certs
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.toLowerCase() !== 'false'

  return { rejectUnauthorized }
}

const getPoolSize = () => {
  const value = process.env.DATABASE_POOL_SIZE
  const parsed = value ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10
}

const getIdleTimeout = () => {
  const value = process.env.DATABASE_IDLE_TIMEOUT_MS
  const parsed = value ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000
}

let client: ReturnType<typeof postgres> | null = null

export const getDbClient = () => {
  if (!client) {
    client = postgres(getDatabaseUrl(), {
      ssl: getSslConfig(),
      max: getPoolSize(),
      idle_timeout: getIdleTimeout(),
    })
  }

  return client
}

export const pingDatabase = async () => {
  const db = getDbClient()
  const result = await db`select now() as now`
  return (result[0] as { now: string } | undefined)?.now
}

export const closeDbClient = async () => {
  if (client) {
    await client.end()
    client = null
  }
}

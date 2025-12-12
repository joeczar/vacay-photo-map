import postgres from 'postgres'

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }

  return url
}

const shouldUseSSL = () => {
  const value = process.env.DATABASE_SSL
  return value === '1' || value?.toLowerCase() === 'true'
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
      ssl: shouldUseSSL() ? { rejectUnauthorized: false } : false,
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

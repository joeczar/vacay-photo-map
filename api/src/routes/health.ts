import { Hono } from 'hono'
import { pingDatabase } from '../db/client'

const health = new Hono()

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  })
})

health.get('/ready', async (c) => {
  let databaseHealthy = true

  try {
    await pingDatabase()
  } catch (error) {
    databaseHealthy = false
    // Log only the error message to avoid exposing connection details
    console.error(
      '[HEALTH] Database check failed:',
      error instanceof Error ? error.message : 'Unknown error'
    )
  }

  return c.json(
    {
      status: databaseHealthy ? 'ok' : 'degraded',
      checks: {
        api: true,
        database: databaseHealthy,
      },
    },
    databaseHealthy ? 200 : 503
  )
})

export { health }

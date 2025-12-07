import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { health } from './routes/health'

const app = new Hono()

// Middleware
app.use('*', logger())

// Routes
app.route('/health', health)

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Vacay Photo Map API',
    version: '1.0.0',
    docs: '/health for status',
  })
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json(
    { error: 'Internal Server Error', message: err.message },
    500
  )
})

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Server starting on port ${port}...`)

export default {
  port,
  fetch: app.fetch,
}

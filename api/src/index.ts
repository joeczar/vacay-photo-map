import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { corsMiddleware } from './middleware/cors'
import { health } from './routes/health'
import { auth } from './routes/auth'
import { trips } from './routes/trips'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', corsMiddleware)

// Routes
app.route('/health', health)
app.route('/api/auth', auth)
app.route('/api/trips', trips)

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
    {
      error: 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
    },
    500
  )
})

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Server starting on port ${port}...`)

// Export app for testing
export { app }

export default {
  port,
  fetch: app.fetch,
}

// Set environment before importing modules
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars'
process.env.RP_ID = 'localhost'
process.env.RP_NAME = 'Test App'
process.env.RP_ORIGIN = 'http://localhost:5173'
// Mock DATABASE_URL to prevent initialization errors - tests that actually use DB will fail
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { trips } from './trips'
import { signToken } from '../utils/jwt'
import type { AuthEnv } from '../types/auth'

// Response types
interface ErrorResponse {
  error: string
  message: string
}

interface TripResponse {
  id: string
  slug: string
  title: string
  description: string | null
  coverPhotoUrl: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

interface TripListResponse {
  trips: TripResponse[]
}

// Unused but kept for reference in integration tests
// interface TripWithPhotosResponse extends TripResponse {
//   photos: Array<{
//     id: string
//     cloudinaryPublicId: string
//     url: string
//     thumbnailUrl: string
//     latitude: number | null
//     longitude: number | null
//     takenAt: string
//     caption: string | null
//     album: string | null
//     createdAt: string
//   }>
// }

// interface SuccessResponse {
//   success: boolean
// }

// Create test app
function createTestApp() {
  const app = new Hono<AuthEnv>()
  app.route('/api/trips', trips)
  return app
}

// Helper to create auth header
async function getAdminAuthHeader(): Promise<{ Authorization: string }> {
  const token = await signToken({
    sub: 'admin-user-123',
    email: 'admin@example.com',
    isAdmin: true,
  })
  return { Authorization: `Bearer ${token}` }
}

async function getUserAuthHeader(): Promise<{ Authorization: string }> {
  const token = await signToken({
    sub: 'user-123',
    email: 'user@example.com',
    isAdmin: false,
  })
  return { Authorization: `Bearer ${token}` }
}

describe('Trip Routes', () => {
  // ==========================================================================
  // GET /api/trips - List public trips
  // Note: Database-dependent tests are skipped in unit test mode
  // Run integration tests with a real database for full coverage
  // ==========================================================================
  describe('GET /api/trips', () => {
    // These tests require a real database connection
    // They are tested via integration tests
    it.skip('returns 200 with trips array (even if empty)', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'GET',
        })
      )
      expect(res.status).toBe(200)
      const data = (await res.json()) as TripListResponse
      expect(Array.isArray(data.trips)).toBe(true)
    })

    it.skip('does not require authentication', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'GET',
        })
      )
      expect(res.status).toBe(200)
    })
  })

  // ==========================================================================
  // GET /api/trips/:slug - Get trip by slug
  // ==========================================================================
  describe('GET /api/trips/:slug', () => {
    it.skip('returns 404 for non-existent trip', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request('http://localhost/api/trips/non-existent-trip-slug', {
          method: 'GET',
        })
      )
      expect(res.status).toBe(404)
      const data = (await res.json()) as ErrorResponse
      expect(data.error).toBe('Not Found')
    })
  })

  // ==========================================================================
  // POST /api/trips - Create trip
  // ==========================================================================
  describe('POST /api/trips', () => {
    it('returns 401 without authentication', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'test-trip',
            title: 'Test Trip',
          }),
        })
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin users', async () => {
      const app = createTestApp()
      const authHeader = await getUserAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({
            slug: 'test-trip',
            title: 'Test Trip',
          }),
        })
      )
      expect(res.status).toBe(403)
      const data = (await res.json()) as ErrorResponse
      expect(data.error).toBe('Forbidden')
    })

    it('returns 400 for invalid slug format', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({
            slug: 'Invalid Slug With Spaces',
            title: 'Test Trip',
          }),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Invalid slug format')
    })

    it('returns 400 for missing title', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({
            slug: 'test-trip',
          }),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Title is required')
    })

    it('returns 400 for invalid URL', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({
            slug: 'test-trip',
            title: 'Test Trip',
            coverPhotoUrl: 'not-a-valid-url',
          }),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Invalid cover photo URL')
    })
  })

  // ==========================================================================
  // PATCH /api/trips/:id - Update trip
  // ==========================================================================
  describe('PATCH /api/trips/:id', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'

    it('returns 401 without authentication', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Updated Title' }),
        })
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin users', async () => {
      const app = createTestApp()
      const authHeader = await getUserAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ title: 'Updated Title' }),
        })
      )
      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid UUID format', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips/not-a-uuid', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ title: 'Updated Title' }),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Invalid trip ID format')
    })

    it.skip('returns 400 for no fields to update (requires DB)', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({}),
        })
      )
      // Will be 404 since trip doesn't exist, or 400 for no fields
      // In this case, it checks for trip existence first
      expect([400, 404]).toContain(res.status)
    })
  })

  // ==========================================================================
  // DELETE /api/trips/:id - Delete trip
  // ==========================================================================
  describe('DELETE /api/trips/:id', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'

    it('returns 401 without authentication', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: 'DELETE',
        })
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin users', async () => {
      const app = createTestApp()
      const authHeader = await getUserAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: 'DELETE',
          headers: authHeader,
        })
      )
      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid UUID format', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips/not-a-uuid', {
          method: 'DELETE',
          headers: authHeader,
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Invalid trip ID format')
    })

    it.skip('returns 404 for non-existent trip (requires DB)', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: 'DELETE',
          headers: authHeader,
        })
      )
      expect(res.status).toBe(404)
    })
  })

  // ==========================================================================
  // PATCH /api/trips/:id/protection - Update protection settings
  // ==========================================================================
  describe('PATCH /api/trips/:id/protection', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'

    it('returns 401 without authentication', async () => {
      const app = createTestApp()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}/protection`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: false }),
        })
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin users', async () => {
      const app = createTestApp()
      const authHeader = await getUserAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}/protection`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ isPublic: false }),
        })
      )
      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid UUID format', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request('http://localhost/api/trips/not-a-uuid/protection', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ isPublic: false }),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Invalid trip ID format')
    })

    it('returns 400 for missing isPublic field', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}/protection`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({}),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('isPublic must be a boolean')
    })

    it('returns 400 for token too short', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}/protection`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ isPublic: false, token: 'short' }),
        })
      )
      expect(res.status).toBe(400)
      const data = (await res.json()) as ErrorResponse
      expect(data.message).toContain('Token must be at least 8 characters')
    })

    it.skip('returns 404 for non-existent trip (requires DB)', async () => {
      const app = createTestApp()
      const authHeader = await getAdminAuthHeader()
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}/protection`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ isPublic: true }),
        })
      )
      expect(res.status).toBe(404)
    })
  })
})

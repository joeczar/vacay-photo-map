import { describe, expect, it } from 'bun:test'
import { app } from '../index'

interface HealthStatus {
  status: string
  timestamp: string
  version: string
}

interface ReadinessStatus {
  status: string
  checks: { api: boolean }
}

interface ApiInfo {
  name: string
  version: string
}

interface ErrorResponse {
  error: string
}

describe('Health endpoints', () => {
  it('GET /health returns ok status', async () => {
    const res = await app.fetch(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as HealthStatus
    expect(data.status).toBe('ok')
    expect(data.timestamp).toBeDefined()
    expect(data.version).toBeDefined()
  })

  it('GET /health/ready returns readiness status', async () => {
    const res = await app.fetch(new Request('http://localhost/health/ready'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as ReadinessStatus
    expect(data.status).toBe('ok')
    expect(data.checks.api).toBe(true)
  })

  it('GET / returns API info', async () => {
    const res = await app.fetch(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as ApiInfo
    expect(data.name).toBe('Vacay Photo Map API')
    expect(data.version).toBe('1.0.0')
  })

  it('GET /nonexistent returns 404', async () => {
    const res = await app.fetch(new Request('http://localhost/nonexistent'))
    expect(res.status).toBe(404)
    const data = (await res.json()) as ErrorResponse
    expect(data.error).toBe('Not Found')
  })
})

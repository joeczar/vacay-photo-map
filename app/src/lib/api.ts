const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class ApiClient {
  private token: string | null = null

  setToken(token: string | null) {
    this.token = token
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    // Merge with any existing headers
    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    })

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    const responseText = await response.text()

    if (!response.ok) {
      let message = responseText
      try {
        message = JSON.parse(responseText).message || responseText
      } catch {
        // Not JSON, use raw text
      }
      throw new ApiError(response.status, message || 'Request failed')
    }

    return responseText ? JSON.parse(responseText) : undefined
  }

  get<T>(path: string) {
    return this.fetch<T>(path)
  }

  post<T>(path: string, body: unknown) {
    return this.fetch<T>(path, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  patch<T>(path: string, body: unknown) {
    return this.fetch<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body)
    })
  }

  delete<T>(path: string) {
    return this.fetch<T>(path, { method: 'DELETE' })
  }
}

export const api = new ApiClient()

/**
 * Helper to set up authenticated API client
 * Throws if not authenticated
 * @returns void - api.setToken is called as side effect
 */
export function requireAuth(getToken: () => string | null): void {
  const token = getToken()
  if (!token) throw new Error('Authentication required')
  api.setToken(token)
}

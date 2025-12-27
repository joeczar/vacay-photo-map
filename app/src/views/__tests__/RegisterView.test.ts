import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RegisterView from '../RegisterView.vue'

// Mock dependencies before imports that use them
vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn()
  }),
  useRoute: vi.fn()
}))

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn()
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: { value: false },
    setAuthState: vi.fn()
  })
}))

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn()
  },
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message)
    }
  }
}))

vi.mock('@/utils/webauthn', () => ({
  checkWebAuthnSupport: () => ({
    supported: true,
    message: ''
  })
}))

vi.mock('@/layouts/AuthLayout.vue', () => ({
  default: {
    name: 'AuthLayout',
    template: '<div><slot /></div>'
  }
}))

// Import mocked modules
import { useRoute } from 'vue-router'
import { startRegistration } from '@simplewebauthn/browser'
import { api } from '@/lib/api'

describe('RegisterView - Invite Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()

    // Mock successful fetch for registration-status
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ registrationOpen: true })
      } as Response)
    )
  })

  it('should pass inviteCode to register/options when present in URL', async () => {
    // Mock route with invite code
    vi.mocked(useRoute).mockReturnValue({
      query: { invite: 'ABC123XYZ' },
      path: '/register',
      name: 'register'
    } as any)

    const wrapper = mount(RegisterView, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    })

    // Wait for onMounted to complete
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))

    // Fill form
    await wrapper.find('input[type="email"]').setValue('test@example.com')
    await nextTick()

    // Mock API responses
    vi.mocked(api.post)
      .mockResolvedValueOnce({
        options: { challenge: 'mock-challenge' }
      })
      .mockResolvedValueOnce({
        token: 'mock-token',
        user: { id: 'user-1', email: 'test@example.com' }
      })

    vi.mocked(startRegistration).mockResolvedValueOnce({
      id: 'credential-id',
      rawId: 'credential-raw-id',
      response: {},
      type: 'public-key'
    } as any)

    // Submit form
    await wrapper.find('form').trigger('submit.prevent')
    await nextTick()
    // Wait for form validation and async submission
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify inviteCode was passed to register/options
    expect(api.post).toHaveBeenCalledWith(
      '/api/auth/register/options',
      expect.objectContaining({
        email: 'test@example.com',
        inviteCode: 'ABC123XYZ'
      })
    )
  })

  it('should work without inviteCode for first-user registration', async () => {
    // Mock route without invite code
    vi.mocked(useRoute).mockReturnValue({
      query: {},
      path: '/register',
      name: 'register'
    } as any)

    const wrapper = mount(RegisterView, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    })

    // Wait for onMounted to complete
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))

    // Fill form
    await wrapper.find('input[type="email"]').setValue('first@example.com')
    await nextTick()

    // Mock API responses
    vi.mocked(api.post)
      .mockResolvedValueOnce({
        options: { challenge: 'mock-challenge' }
      })
      .mockResolvedValueOnce({
        token: 'mock-token',
        user: { id: 'user-1', email: 'first@example.com', isAdmin: true }
      })

    vi.mocked(startRegistration).mockResolvedValueOnce({
      id: 'credential-id',
      rawId: 'credential-raw-id',
      response: {},
      type: 'public-key'
    } as any)

    // Submit form
    await wrapper.find('form').trigger('submit.prevent')
    await nextTick()
    // Wait for form validation and async submission
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify request works without inviteCode
    expect(api.post).toHaveBeenCalledWith(
      '/api/auth/register/options',
      expect.objectContaining({
        email: 'first@example.com'
      })
    )

    // inviteCode should be undefined, not included in request
    const callArgs = vi.mocked(api.post).mock.calls[0]
    const requestBody = callArgs[1] as any
    expect(requestBody.inviteCode).toBeUndefined()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { useAuth, _resetAuthState } from './useAuth'

// Mock Supabase
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSelect(),
        }),
      }),
    }),
  },
}))

// Test component that uses the composable
const TestComponent = defineComponent({
  setup() {
    return useAuth()
  },
  template: '<div></div>',
})

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetAuthState()

    // Default mock implementations
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  })

  afterEach(() => {
    _resetAuthState()
  })

  describe('initial state', () => {
    it('should start with no user', async () => {
      const wrapper = mount(TestComponent)
      await nextTick()

      expect(wrapper.vm.user).toBeNull()
      expect(wrapper.vm.isAuthenticated).toBe(false)
      expect(wrapper.vm.isAdmin).toBe(false)
    })

    it('should initialize from existing session', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: true }

      mockGetSession.mockResolvedValue({ data: { session: mockSession } })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })

      const wrapper = mount(TestComponent)

      // Wait for async initialization to complete
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.user).toEqual(mockUser)
      expect(wrapper.vm.isAuthenticated).toBe(true)
      expect(wrapper.vm.isAdmin).toBe(true)
    })
  })

  describe('login', () => {
    it('should login successfully', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: false }

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })

      const wrapper = mount(TestComponent)
      await nextTick()

      const { error } = await wrapper.vm.login('test@example.com', 'password')

      expect(error).toBeNull()
      expect(wrapper.vm.user).toEqual(mockUser)
      expect(wrapper.vm.isAuthenticated).toBe(true)
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      })
    })

    it('should handle login error', async () => {
      const mockError = { message: 'Invalid credentials' }
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: mockError,
      })

      const wrapper = mount(TestComponent)
      await nextTick()

      const { error } = await wrapper.vm.login('test@example.com', 'wrong')

      expect(error).toEqual(mockError)
      expect(wrapper.vm.user).toBeNull()
      expect(wrapper.vm.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    it('should logout successfully', async () => {
      // Setup logged in state
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: true }

      mockGetSession.mockResolvedValue({ data: { session: mockSession } })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })
      mockSignOut.mockResolvedValue({ error: null })

      const wrapper = mount(TestComponent)

      // Wait for async initialization to complete
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.isAuthenticated).toBe(true)

      const { error } = await wrapper.vm.logout()

      expect(error).toBeNull()
      expect(wrapper.vm.user).toBeNull()
      expect(wrapper.vm.session).toBeNull()
      expect(wrapper.vm.profile).toBeNull()
      expect(wrapper.vm.isAuthenticated).toBe(false)
    })

    it('should handle logout error', async () => {
      const mockError = { message: 'Logout failed' }
      mockSignOut.mockResolvedValue({ error: mockError })

      const wrapper = mount(TestComponent)
      await nextTick()

      const { error } = await wrapper.vm.logout()

      expect(error).toEqual(mockError)
    })
  })

  describe('isAdmin', () => {
    it('should return false when not logged in', async () => {
      const wrapper = mount(TestComponent)
      await nextTick()

      expect(wrapper.vm.isAdmin).toBe(false)
    })

    it('should return false for non-admin user', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: false }

      mockGetSession.mockResolvedValue({ data: { session: mockSession } })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })

      const wrapper = mount(TestComponent)

      // Wait for async initialization to complete
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.isAdmin).toBe(false)
    })

    it('should return true for admin user', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: true }

      mockGetSession.mockResolvedValue({ data: { session: mockSession } })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })

      const wrapper = mount(TestComponent)

      // Wait for async initialization to complete
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.isAdmin).toBe(true)
    })
  })

  describe('profile fetch failure', () => {
    it('should sign out and return error if profile fetch fails during login', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      })
      mockSelect.mockResolvedValue({ data: null, error: { message: 'Profile not found' } })
      mockSignOut.mockResolvedValue({ error: null })

      const wrapper = mount(TestComponent)
      await nextTick()

      const { error } = await wrapper.vm.login('test@example.com', 'password')

      expect(error).not.toBeNull()
      expect(error?.message).toBe('Failed to retrieve user profile after login.')
      expect(mockSignOut).toHaveBeenCalled()
      expect(wrapper.vm.isAuthenticated).toBe(false)
    })
  })

  describe('onAuthStateChange callback', () => {
    // Helper type for auth callback
    type AuthCallback = (event: string, session: { user: { id: string; email: string }; access_token: string } | null) => void

    it('should update state when user signs in via callback', async () => {
      let authChangeCallback: AuthCallback | null = null

      // Capture the callback
      mockOnAuthStateChange.mockImplementation((callback: AuthCallback) => {
        authChangeCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      const wrapper = mount(TestComponent)

      // Wait for initialization
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.isAuthenticated).toBe(false)

      // Simulate auth state change - new user signs in
      const newUser = { id: 'new-user-456', email: 'new@example.com' }
      const newSession = { user: newUser, access_token: 'new-token' }
      const newProfile = { id: 'new-user-456', display_name: 'New User', is_admin: false }

      mockSelect.mockResolvedValue({ data: newProfile, error: null })

      // Trigger the callback
      authChangeCallback!('SIGNED_IN', newSession)

      // Wait for profile fetch
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.user).toEqual(newUser)
      expect(wrapper.vm.isAuthenticated).toBe(true)
      expect(wrapper.vm.profile).toEqual(newProfile)
    })

    it('should clear state when user signs out via callback', async () => {
      let authChangeCallback: AuthCallback | null = null

      // Setup with logged in user
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: true }

      mockGetSession.mockResolvedValue({ data: { session: mockSession } })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })

      mockOnAuthStateChange.mockImplementation((callback: AuthCallback) => {
        authChangeCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      const wrapper = mount(TestComponent)

      // Wait for initialization
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      expect(wrapper.vm.isAuthenticated).toBe(true)

      // Simulate sign out
      authChangeCallback!('SIGNED_OUT', null)

      await nextTick()

      expect(wrapper.vm.user).toBeNull()
      expect(wrapper.vm.session).toBeNull()
      expect(wrapper.vm.profile).toBeNull()
      expect(wrapper.vm.isAuthenticated).toBe(false)
    })

    it('should only update session on token refresh (same user)', async () => {
      let authChangeCallback: AuthCallback | null = null

      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSession = { user: mockUser, access_token: 'token' }
      const mockProfile = { id: 'user-123', display_name: 'Test', is_admin: true }

      mockGetSession.mockResolvedValue({ data: { session: mockSession } })
      mockSelect.mockResolvedValue({ data: mockProfile, error: null })

      mockOnAuthStateChange.mockImplementation((callback: AuthCallback) => {
        authChangeCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      const wrapper = mount(TestComponent)

      // Wait for initialization
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      // Clear mock to track new calls
      mockSelect.mockClear()

      // Simulate token refresh (same user, new token)
      const refreshedSession = { user: mockUser, access_token: 'new-refreshed-token' }
      authChangeCallback!('TOKEN_REFRESHED', refreshedSession)

      await nextTick()

      // Profile should NOT be fetched again
      expect(mockSelect).not.toHaveBeenCalled()

      // Session should be updated
      expect(wrapper.vm.session).toEqual(refreshedSession)
    })

    it('should sign out if profile fetch fails on auth state change', async () => {
      let authChangeCallback: AuthCallback | null = null

      mockOnAuthStateChange.mockImplementation((callback: AuthCallback) => {
        authChangeCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })
      mockSignOut.mockResolvedValue({ error: null })

      const wrapper = mount(TestComponent)

      // Wait for initialization
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      // Simulate new user sign in with failing profile fetch
      const newUser = { id: 'new-user-456', email: 'new@example.com' }
      const newSession = { user: newUser, access_token: 'new-token' }

      mockSelect.mockResolvedValue({ data: null, error: { message: 'Profile not found' } })

      authChangeCallback!('SIGNED_IN', newSession)

      // Wait for profile fetch attempt
      await new Promise(resolve => setImmediate(resolve))
      await nextTick()

      // Should have signed out
      expect(mockSignOut).toHaveBeenCalled()
      expect(wrapper.vm.isAuthenticated).toBe(false)
    })
  })
})

import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { api } from '@/lib/api'

/**
 * Authenticated user data returned from API
 * Matches the response from GET /api/auth/me
 */
export interface User {
  /** User UUID from database */
  id: string
  /** User's email address */
  email: string
  /** Optional display name shown in UI */
  displayName: string | null
  /** Whether user has admin privileges */
  isAdmin: boolean
  /** ISO 8601 timestamp when user was created */
  createdAt: string
  /** ISO 8601 timestamp when user was last updated */
  updatedAt: string
}

// Token storage helpers
const TOKEN_KEY = 'auth_token'

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// Shared state across all component instances
const user = ref<User | null>(null)
const loading = ref(true)

/**
 * Composable for managing authentication state
 *
 * Features:
 * - Tracks current user
 * - Provides login/logout methods
 * - JWT token management
 * - Shares state across all component instances
 */
export function useAuth() {
  // Computed properties
  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.isAdmin ?? false)

  /**
   * Get the current auth token from localStorage
   */
  function getToken(): string | null {
    return getStoredToken()
  }

  /**
   * Set auth state with token and user data
   */
  function setAuthState(token: string, userData: User): void {
    setStoredToken(token)
    api.setToken(token)
    user.value = userData
  }

  /**
   * Logout current user
   */
  async function logout(): Promise<void> {
    clearStoredToken()
    api.setToken(null)
    user.value = null
  }

  /**
   * Check authentication status and fetch user data
   */
  async function checkAuth(): Promise<void> {
    const token = getStoredToken()

    if (!token) {
      loading.value = false
      return
    }

    api.setToken(token)

    try {
      const userData = await api.get<User>('/api/auth/me')
      user.value = userData
    } catch (error) {
      // Token invalid or expired - clear state
      console.error('[useAuth] Auth check failed:', error)
      clearStoredToken()
      api.setToken(null)
      user.value = null
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    user: user as Ref<User | null>,
    loading: loading as Ref<boolean>,

    // Computed
    isAuthenticated: isAuthenticated as ComputedRef<boolean>,
    isAdmin: isAdmin as ComputedRef<boolean>,

    // Methods
    getToken,
    setAuthState,
    logout,
    checkAuth
  }
}

/**
 * Initialize auth state on app startup
 * Call this before mounting the app to ensure router guards have valid state
 */
export async function initializeAuth(): Promise<void> {
  const { checkAuth } = useAuth()
  await checkAuth()
}

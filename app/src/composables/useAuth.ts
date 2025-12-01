import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { User, Session, AuthError, Subscription } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { TablesRow } from '@/lib/database.types'

type UserProfile = TablesRow<'user_profiles'>

// Shared state across all component instances
const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const profile = ref<UserProfile | null>(null)
const isLoading = ref(true)
const isInitialized = ref(false)

// Store subscription for cleanup
let authSubscription: Subscription | null = null

/**
 * Reset auth state (for testing)
 * @internal
 */
export function _resetAuthState() {
  user.value = null
  session.value = null
  profile.value = null
  isLoading.value = true
  isInitialized.value = false
  if (authSubscription) {
    authSubscription.unsubscribe()
    authSubscription = null
  }
}

/**
 * Composable for managing authentication state
 *
 * Features:
 * - Tracks current user and session
 * - Fetches user profile with admin status
 * - Provides login/logout methods
 * - Shares state across all component instances
 */
export function useAuth() {
  // Computed properties
  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => profile.value?.is_admin ?? false)

  /**
   * Fetch user profile from database
   */
  async function fetchProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching user profile:', error)
      return null
    }

    return data
  }

  /**
   * Login with email and password
   */
  async function login(email: string, password: string): Promise<{ error: AuthError | null }> {
    isLoading.value = true

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      if (data.user) {
        const userProfile = await fetchProfile(data.user.id)
        if (userProfile) {
          user.value = data.user
          session.value = data.session
          profile.value = userProfile
        } else {
          // Profile fetch failed - sign out to prevent inconsistent state
          await supabase.auth.signOut()
          return {
            error: {
              name: 'ProfileFetchError',
              message: 'Failed to retrieve user profile after login.',
            } as AuthError,
          }
        }
      }

      return { error: null }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Logout current user
   */
  async function logout(): Promise<{ error: AuthError | null }> {
    isLoading.value = true

    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        return { error }
      }

      user.value = null
      session.value = null
      profile.value = null

      return { error: null }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Initialize auth state from existing session
   */
  async function initialize() {
    if (isInitialized.value) return

    isLoading.value = true

    try {
      // Get current session
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (currentSession) {
        const userProfile = await fetchProfile(currentSession.user.id)
        if (userProfile) {
          session.value = currentSession
          user.value = currentSession.user
          profile.value = userProfile
        } else {
          // Profile fetch failed - sign out to prevent inconsistent state
          console.error('Failed to fetch profile during initialization. Signing out.')
          await supabase.auth.signOut()
        }
      }

      isInitialized.value = true

      // Listen for auth state changes
      const { data } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (newSession?.user) {
          const newProfile = await fetchProfile(newSession.user.id)
          if (newProfile) {
            session.value = newSession
            user.value = newSession.user
            profile.value = newProfile
          } else {
            // Profile fetch failed - sign out to prevent inconsistent state
            console.error('Failed to fetch profile on auth state change. Signing out.')
            await supabase.auth.signOut()
          }
        } else {
          session.value = null
          user.value = null
          profile.value = null
        }
      })

      authSubscription = data.subscription
    } finally {
      isLoading.value = false
    }
  }

  // Cleanup subscription on unmount
  function cleanup() {
    if (authSubscription) {
      authSubscription.unsubscribe()
      authSubscription = null
    }
  }

  // Initialize on mount
  onMounted(() => {
    if (!isInitialized.value) {
      initialize()
    }
  })

  // Cleanup on unmount
  onBeforeUnmount(cleanup)

  return {
    // State
    user,
    session,
    profile,
    isLoading,

    // Computed
    isAuthenticated,
    isAdmin,

    // Methods
    login,
    logout,
    initialize,
  }
}

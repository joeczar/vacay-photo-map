import { ref, computed, onMounted } from 'vue'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { TablesRow } from '@/lib/database.types'

type UserProfile = TablesRow<'user_profiles'>

// Shared state across all component instances
const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const profile = ref<UserProfile | null>(null)
const isLoading = ref(true)
const isInitialized = ref(false)

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      isLoading.value = false
      return { error }
    }

    user.value = data.user
    session.value = data.session

    if (data.user) {
      profile.value = await fetchProfile(data.user.id)
    }

    isLoading.value = false
    return { error: null }
  }

  /**
   * Logout current user
   */
  async function logout(): Promise<{ error: AuthError | null }> {
    isLoading.value = true

    const { error } = await supabase.auth.signOut()

    if (error) {
      isLoading.value = false
      return { error }
    }

    user.value = null
    session.value = null
    profile.value = null
    isLoading.value = false

    return { error: null }
  }

  /**
   * Initialize auth state from existing session
   */
  async function initialize() {
    if (isInitialized.value) return

    isLoading.value = true

    // Get current session
    const { data: { session: currentSession } } = await supabase.auth.getSession()

    if (currentSession) {
      session.value = currentSession
      user.value = currentSession.user

      // Fetch profile
      profile.value = await fetchProfile(currentSession.user.id)
    }

    isInitialized.value = true
    isLoading.value = false

    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null

      if (newSession?.user) {
        profile.value = await fetchProfile(newSession.user.id)
      } else {
        profile.value = null
      }
    })
  }

  // Initialize on mount
  onMounted(() => {
    if (!isInitialized.value) {
      initialize()
    }
  })

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

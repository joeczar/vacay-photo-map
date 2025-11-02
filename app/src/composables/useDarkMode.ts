import { ref, watch, onMounted } from 'vue'

const STORAGE_KEY = 'theme-preference'
const DARK_CLASS = 'dark'

// Shared state across all component instances
const isDark = ref(false)
const isInitialized = ref(false)

/**
 * Composable for managing dark mode state
 *
 * Features:
 * - Detects system preference on mount
 * - Persists user preference to localStorage
 * - Applies dark class to document.documentElement
 * - Shares state across all component instances
 *
 * @returns {Object} Dark mode state and controls
 */
export function useDarkMode() {
  /**
   * Get system color scheme preference
   */
  function getSystemPreference(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  /**
   * Get stored user preference from localStorage
   */
  function getStoredPreference(): boolean | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return null
    return stored === 'dark'
  }

  /**
   * Apply dark mode class to document
   */
  function applyTheme(dark: boolean) {
    if (typeof document === 'undefined') return

    if (dark) {
      document.documentElement.classList.add(DARK_CLASS)
    } else {
      document.documentElement.classList.remove(DARK_CLASS)
    }
  }

  /**
   * Save preference to localStorage
   */
  function savePreference(dark: boolean) {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  }

  /**
   * Toggle dark mode on/off
   */
  function toggleDark() {
    isDark.value = !isDark.value
  }

  /**
   * Set dark mode explicitly
   */
  function setDark(value: boolean) {
    isDark.value = value
  }

  /**
   * Initialize dark mode on mount
   * Priority: localStorage > system preference > default (light)
   */
  function initialize() {
    if (isInitialized.value) return

    const stored = getStoredPreference()

    if (stored !== null) {
      // Use stored preference if exists
      isDark.value = stored
    } else {
      // Fall back to system preference
      isDark.value = getSystemPreference()
    }

    applyTheme(isDark.value)
    isInitialized.value = true

    // Watch for future changes and persist
    watch(isDark, (newValue) => {
      applyTheme(newValue)
      savePreference(newValue)
    })

    // Listen for system preference changes (optional enhancement)
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', (e) => {
        // Only auto-update if user hasn't set a preference
        const stored = getStoredPreference()
        if (stored === null) {
          isDark.value = e.matches
        }
      })
    }
  }

  // Initialize immediately if not in SSR context
  // This ensures the state is ready before mounting
  if (typeof window !== 'undefined' && !isInitialized.value) {
    initialize()
  }

  // Also initialize on mount for SSR compatibility
  onMounted(initialize)

  return {
    isDark,
    toggleDark,
    setDark
  }
}

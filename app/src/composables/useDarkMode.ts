import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const STORAGE_KEY = 'theme-preference'
const DARK_CLASS = 'dark'

// Shared state across all component instances
const isDark = ref(false)
const isInitialized = ref(false)

// Store media query listener for cleanup
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null
let mediaQuery: MediaQueryList | null = null

/**
 * Reset the dark mode state (for testing)
 * @internal
 */
export function _resetDarkModeState() {
  isDark.value = false
  isInitialized.value = false
  if (mediaQuery && mediaQueryListener) {
    mediaQuery.removeEventListener('change', mediaQueryListener)
  }
  mediaQuery = null
  mediaQueryListener = null
}

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
    document.documentElement.classList.toggle(DARK_CLASS, dark)
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
    savePreference(isDark.value)
    // Apply immediately to avoid relying solely on watcher timing
    applyTheme(isDark.value)
  }

  /**
   * Set dark mode explicitly
   */
  function setDark(value: boolean) {
    isDark.value = value
    savePreference(isDark.value)
    // Apply immediately to avoid relying solely on watcher timing
    applyTheme(isDark.value)
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
      // Fall back to Dark Mode (Dark Friendly default)
      isDark.value = true
    }

    applyTheme(isDark.value)
    isInitialized.value = true
  }

  // Setup system preference listener (once)
  function setupSystemListener() {
    if (typeof window === 'undefined' || mediaQuery) return

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryListener = (e: MediaQueryListEvent) => {
      // Only auto-update if user hasn't set a preference
      const stored = getStoredPreference()
      if (stored === null) {
        isDark.value = e.matches
      }
    }
    mediaQuery.addEventListener('change', mediaQueryListener)
  }

  // Cleanup listener
  function cleanup() {
    if (mediaQuery && mediaQueryListener) {
      mediaQuery.removeEventListener('change', mediaQueryListener)
    }
  }

  // Watch for changes and apply theme (only, no save)
  // This watch is registered once at module level, not per component
  if (!isInitialized.value) {
    watch(isDark, newValue => {
      applyTheme(newValue)
    })
  }

  // Initialize on mount only (for both SSR and test compatibility)
  onMounted(() => {
    if (!isInitialized.value) {
      initialize()
      setupSystemListener()
    }
  })

  // Cleanup on unmount
  onBeforeUnmount(cleanup)

  return {
    isDark,
    toggleDark,
    setDark
  }
}

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

// Helper to create test component with fresh import
async function createTestComponent() {
  const { useDarkMode } = await import('./useDarkMode')
  return defineComponent({
    setup() {
      const darkMode = useDarkMode()
      return { darkMode }
    },
    template: '<div>Test</div>'
  })
}

// Store media query change callback for testing
let mediaQueryChangeCallback: ((event: MediaQueryListEvent) => void) | null = null

describe('useDarkMode', () => {
  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear()
    // Remove dark class from document
    document.documentElement.classList.remove('dark')
    // Reset callback
    mediaQueryChangeCallback = null

    // Reset the module to get fresh shared state
    await vi.resetModules()

    // Reset matchMedia mock with callback capture
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (event: string, callback: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            mediaQueryChangeCallback = callback
          }
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with light mode by default', async () => {
    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should detect system dark mode preference', async () => {
    // Mock system preferring dark mode
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })

    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('should save preference to localStorage when toggled', async () => {
    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    wrapper.vm.darkMode.toggleDark()
    await nextTick()

    expect(localStorage.getItem('theme-preference')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    wrapper.vm.darkMode.toggleDark()
    await nextTick()

    expect(localStorage.getItem('theme-preference')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should restore preference from localStorage', async () => {
    localStorage.setItem('theme-preference', 'dark')

    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('should prioritize localStorage over system preference', async () => {
    // System prefers dark
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })

    // But user explicitly chose light
    localStorage.setItem('theme-preference', 'light')

    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should allow explicit setDark', async () => {
    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    wrapper.vm.darkMode.setDark(true)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme-preference')).toBe('dark')
  })

  it('should share state across multiple component instances', async () => {
    const TestComponent = await createTestComponent()
    const wrapper1 = mount(TestComponent)
    const wrapper2 = mount(TestComponent)
    await nextTick()

    wrapper1.vm.darkMode.toggleDark()
    await nextTick()

    expect(wrapper1.vm.darkMode.isDark.value).toBe(true)
    expect(wrapper2.vm.darkMode.isDark.value).toBe(true)
  })

  it('should update theme on system change when no local preference is set', async () => {
    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(false)
    expect(localStorage.getItem('theme-preference')).toBe(null)

    // Simulate system change to dark
    if (mediaQueryChangeCallback) {
      mediaQueryChangeCallback({ matches: true } as MediaQueryListEvent)
      await nextTick()
    }

    expect(wrapper.vm.darkMode.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    // Critical: localStorage should remain null (no user preference saved)
    expect(localStorage.getItem('theme-preference')).toBe(null)

    // Simulate system change back to light
    if (mediaQueryChangeCallback) {
      mediaQueryChangeCallback({ matches: false } as MediaQueryListEvent)
      await nextTick()
    }

    expect(wrapper.vm.darkMode.isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme-preference')).toBe(null)
  })

  it('should NOT update theme on system change when user has set a preference', async () => {
    // User explicitly chooses light mode
    localStorage.setItem('theme-preference', 'light')

    const TestComponent = await createTestComponent()
    const wrapper = mount(TestComponent)
    await nextTick()

    expect(wrapper.vm.darkMode.isDark.value).toBe(false)

    // System changes to dark, but user preference should win
    if (mediaQueryChangeCallback) {
      mediaQueryChangeCallback({ matches: true } as MediaQueryListEvent)
      await nextTick()
    }

    expect(wrapper.vm.darkMode.isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme-preference')).toBe('light')
  })
})

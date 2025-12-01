import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminView from './AdminView.vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// Mock Supabase (required by MainLayout -> useAuth)
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

// Mock the modules
vi.mock('@/utils/exif', () => ({
  extractExifBatch: vi.fn().mockResolvedValue(new Map())
}))

vi.mock('@/lib/cloudinary', () => ({
  uploadMultipleFiles: vi.fn().mockResolvedValue([
    { publicId: 'test1', url: 'https://test.com/1.jpg', thumbnailUrl: 'https://test.com/1_thumb.jpg' },
    { publicId: 'test2', url: 'https://test.com/2.jpg', thumbnailUrl: 'https://test.com/2_thumb.jpg' }
  ])
}))

vi.mock('@/utils/database', () => ({
  createTrip: vi.fn().mockResolvedValue({ id: 'trip-123' }),
  createPhotos: vi.fn().mockResolvedValue([]),
  updateTripCoverPhoto: vi.fn().mockResolvedValue({})
}))

vi.mock('@/utils/slug', () => ({
  generateUniqueSlug: vi.fn((title: string) => `${title.toLowerCase()}-test123`)
}))

describe('AdminView Form Validation', () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin', component: AdminView }]
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the form fields', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Check that all form fields are rendered
    expect(wrapper.find('input[placeholder="Summer Vacation 2024"]').exists()).toBe(true)
    expect(wrapper.find('textarea[placeholder="Tell us about your trip..."]').exists()).toBe(true)
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })

  it('should disable upload button when title is empty', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    await titleInput.setValue('')
    await flushPromises()

    // Add files so only title is invalid
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false
    })
    await fileInput.trigger('change')
    await flushPromises()

    // Button should be disabled due to empty title
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))
    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeDefined()
  })

  it('should disable upload button with invalid short title', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Set invalid short title (2 chars)
    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    await titleInput.setValue('ab')
    await titleInput.trigger('blur') // Trigger validation
    await flushPromises()

    // Add files
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false
    })
    await fileInput.trigger('change')
    await flushPromises()

    // Button should be disabled
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))
    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeDefined()
  })

  it('should enable upload button with valid short title and files', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Set valid minimum length title (3 chars)
    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    await titleInput.setValue('abc')
    await flushPromises()

    // Add files
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false
    })
    await fileInput.trigger('change')
    await flushPromises()

    // Button should be enabled with valid input
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))
    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeUndefined()
  })

  it('should enable upload button with long title under limit', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Set title at maximum length (100 chars)
    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    const validTitle = 'a'.repeat(100)
    await titleInput.setValue(validTitle)
    await flushPromises()

    // Add files
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false
    })
    await fileInput.trigger('change')
    await flushPromises()

    // Button should be enabled
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))
    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeUndefined()
  })

  it('should enable upload button with long description under limit', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Set valid title
    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    await titleInput.setValue('My Trip')
    await flushPromises()

    // Set description at maximum length (500 chars)
    const descInput = wrapper.find('textarea[placeholder="Tell us about your trip..."]')
    const validDesc = 'a'.repeat(500)
    await descInput.setValue(validDesc)
    await flushPromises()

    // Add files
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false
    })
    await fileInput.trigger('change')
    await flushPromises()

    // Button should be enabled
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))
    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeUndefined()
  })

  it('should allow valid trip title', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    await titleInput.setValue('My Summer Trip')
    await titleInput.trigger('blur')

    await flushPromises()
    await wrapper.vm.$nextTick()

    // Should not show error for valid input
    const errorMessage = wrapper.text()
    expect(errorMessage).not.toContain('at least 3 characters')
    expect(errorMessage).not.toContain('less than 100 characters')
    expect(errorMessage).not.toContain('required')
  })

  it('should disable upload button when no files are selected', () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Find button by text content
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))

    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeDefined()
  })
})

describe('AdminView File Upload', () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin', component: AdminView }]
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle file selection', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    const fileInput = wrapper.find('input[type="file"]')

    // Create mock files
    const file1 = new File(['test1'], 'test1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['test2'], 'test2.jpg', { type: 'image/jpeg' })

    // Simulate file selection
    Object.defineProperty(fileInput.element, 'files', {
      value: [file1, file2],
      writable: false
    })

    await fileInput.trigger('change')
    await wrapper.vm.$nextTick()

    // Should show file count
    expect(wrapper.text()).toContain('2 photos selected')
  })

  it('should show file previews after selection', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    const fileInput = wrapper.find('input[type="file"]')

    const file1 = new File(['test1'], 'test1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['test2'], 'test2.jpg', { type: 'image/jpeg' })

    Object.defineProperty(fileInput.element, 'files', {
      value: [file1, file2],
      writable: false
    })

    await fileInput.trigger('change')
    await wrapper.vm.$nextTick()

    // Should render preview images
    const images = wrapper.findAll('img[alt="test1.jpg"], img[alt="test2.jpg"]')
    expect(images.length).toBeGreaterThan(0)
  })

  it('should enable upload button when title and files are valid', async () => {
    const wrapper = mount(AdminView, {
      global: {
        plugins: [router]
      }
    })

    // Set valid title
    const titleInput = wrapper.find('input[placeholder="Summer Vacation 2024"]')
    await titleInput.setValue('My Trip')
    await flushPromises()

    // Add files
    const fileInput = wrapper.find('input[type="file"]')
    const file1 = new File(['test1'], 'test1.jpg', { type: 'image/jpeg' })

    Object.defineProperty(fileInput.element, 'files', {
      value: [file1],
      writable: false
    })

    await fileInput.trigger('change')
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Upload button should be enabled
    const buttons = wrapper.findAll('button')
    const uploadButton = buttons.find(btn => btn.text().includes('Start Upload'))

    expect(uploadButton).toBeDefined()
    expect(uploadButton?.attributes('disabled')).toBeUndefined()
  })
})

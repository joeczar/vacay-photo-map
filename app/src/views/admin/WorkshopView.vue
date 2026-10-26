<template>
  <AdminLayout>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="sm" @click="goBack">
          <ArrowLeft class="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 class="text-2xl font-bold text-foreground">
            {{ trip ? trip.title : 'Loading...' }}
          </h1>
          <p class="text-sm text-muted-foreground">Workshop — stories and sections</p>
        </div>
      </div>
      <p class="text-sm text-muted-foreground" aria-live="polite">
        <span v-if="pendingCount > 0">Saving…</span>
        <span v-else-if="errorCount > 0" class="text-destructive">{{ errorCount }} failed</span>
        <span v-else-if="trip">All changes saved</span>
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16">
      <p class="text-muted-foreground">Loading workshop...</p>
    </div>

    <!-- Error State -->
    <ErrorState v-else-if="error" :message="error" title="Failed to load trip">
      <Button variant="outline" size="sm" class="btn-gradient-primary" @click="loadTrip">
        Try again
      </Button>
    </ErrorState>

    <!-- Main Content -->
    <div v-else-if="trip" class="flex flex-col lg:flex-row gap-6">
      <!-- Sections Panel -->
      <aside class="lg:w-72 shrink-0">
        <Card class="p-4 lg:sticky lg:top-4">
          <h2 class="font-semibold text-lg mb-3">Sections</h2>

          <p v-if="sections.length === 0" class="text-sm text-muted-foreground mb-3">
            No sections yet. Group photos into chapters of the trip.
          </p>

          <ul v-else class="space-y-1 mb-3">
            <li
              v-for="(section, index) in sections"
              :key="section.id"
              class="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted/60"
            >
              <template v-if="editingSectionId === section.id">
                <Input
                  v-model="editingTitle"
                  class="h-8 text-sm"
                  :aria-label="`Rename section ${section.title}`"
                  @keydown.enter.prevent="commitRename(section)"
                  @keydown.esc.prevent="cancelRename"
                  @blur="commitRename(section)"
                  autofocus
                />
              </template>
              <template v-else>
                <button
                  type="button"
                  class="flex-1 text-left text-sm truncate"
                  :title="section.title"
                  @click="startRename(section)"
                >
                  {{ section.title }}
                  <span class="text-muted-foreground ml-1">({{ photoCountFor(section.id) }})</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :disabled="index === 0 || reordering"
                  :aria-label="`Move ${section.title} up`"
                  @click="moveSection(index, -1)"
                >
                  <ChevronUp class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :disabled="index === sections.length - 1 || reordering"
                  :aria-label="`Move ${section.title} down`"
                  @click="moveSection(index, 1)"
                >
                  <ChevronDown class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  :aria-label="`Delete ${section.title}`"
                  @click="sectionToDelete = section"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </template>
            </li>
          </ul>

          <form class="flex gap-2" @submit.prevent="handleCreateSection">
            <Input
              v-model="newSectionTitle"
              placeholder="New section title"
              class="h-9 text-sm"
              aria-label="New section title"
              maxlength="200"
            />
            <Button type="submit" size="sm" :disabled="!newSectionTitle.trim() || creatingSection">
              <Plus class="w-4 h-4" />
              <span class="sr-only">Add section</span>
            </Button>
          </form>
        </Card>
      </aside>

      <!-- Photo List -->
      <div class="flex-1 min-w-0">
        <div
          v-if="trip.photos.length === 0"
          class="text-center py-16 border-2 border-dashed border-border rounded-lg"
        >
          <p class="text-muted-foreground">No photos in this trip</p>
        </div>

        <div v-else class="space-y-4">
          <Card v-for="photo in trip.photos" :key="photo.id" class="p-4">
            <div class="flex flex-col sm:flex-row gap-4">
              <!-- Thumbnail -->
              <div class="sm:w-40 shrink-0">
                <div class="aspect-square overflow-hidden rounded-md bg-muted">
                  <img
                    :src="getImageUrl(photo.thumbnail_url, { rotation: photo.rotation })"
                    :alt="photo.caption || 'Photo'"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <p class="text-xs text-muted-foreground mt-2">
                  {{ formatDate(photo.taken_at) }}
                </p>
                <p v-if="photo.latitude != null" class="text-xs text-muted-foreground">
                  {{ photo.latitude.toFixed(3) }}, {{ photo.longitude?.toFixed(3) }}
                </p>
              </div>

              <!-- Editor -->
              <div class="flex-1 min-w-0 space-y-3">
                <div class="flex items-center gap-2 flex-wrap">
                  <Label :for="`section-${photo.id}`" class="text-sm">Section</Label>
                  <select
                    :id="`section-${photo.id}`"
                    class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    :value="photo.section_id ?? ''"
                    @change="handleSectionChange(photo, $event)"
                  >
                    <option value="">Unsectioned</option>
                    <option v-for="section in sections" :key="section.id" :value="section.id">
                      {{ section.title }}
                    </option>
                  </select>
                  <Badge v-if="sectionTitleFor(photo.section_id)" variant="secondary">
                    {{ sectionTitleFor(photo.section_id) }}
                  </Badge>
                </div>

                <div>
                  <Label :for="`description-${photo.id}`" class="sr-only">Description</Label>
                  <Textarea
                    :id="`description-${photo.id}`"
                    :model-value="drafts[photo.id] ?? photo.description ?? ''"
                    placeholder="Add a story for this photo..."
                    class="min-h-[80px] resize-none overflow-hidden"
                    @update:model-value="onDescriptionInput(photo, String($event))"
                    @blur="flushDescription(photo)"
                    @input="autoResize($event)"
                  />
                  <div class="flex items-center justify-between mt-1 text-xs">
                    <span
                      :class="
                        descriptionLength(photo) > SOFT_LIMIT
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      "
                    >
                      {{ descriptionLength(photo) }} / {{ SOFT_LIMIT }}
                    </span>
                    <span class="text-muted-foreground" aria-live="polite">
                      <span v-if="saveState[photo.id] === 'saving'">Saving…</span>
                      <span v-else-if="saveState[photo.id] === 'saved'">Saved</span>
                      <span v-else-if="saveState[photo.id] === 'error'" class="text-destructive">
                        Failed to save
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>

    <!-- Delete Section Confirmation -->
    <Dialog
      :open="sectionToDelete !== null"
      @update:open="open => !open && (sectionToDelete = null)"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete section?</DialogTitle>
          <DialogDescription>
            "{{ sectionToDelete?.title }}" will be removed. Its
            {{ sectionToDelete ? photoCountFor(sectionToDelete.id) : 0 }} photos stay in the trip
            and become unsectioned.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="sectionToDelete = null">Cancel</Button>
          <Button variant="destructive" :disabled="deletingSection" @click="confirmDeleteSection">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  getTripByIdWithAllPhotos,
  updatePhotoDescription,
  updatePhotoSection
} from '@/utils/database'
import type { TripWithPhotos, Photo } from '@/utils/database'
import { createSection, updateSection, deleteSection } from '@/lib/sections'
import type { Section } from '@/lib/sections'
import AdminLayout from '@/layouts/AdminLayout.vue'
import ErrorState from '@/components/ErrorState.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getImageUrl } from '@/utils/image'
import { ArrowLeft, ChevronUp, ChevronDown, Plus, Trash2 } from 'lucide-vue-next'
import { useToast } from '@/components/ui/toast/use-toast'

const SOFT_LIMIT = 500
const SAVE_DEBOUNCE_MS = 1000

const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const trip = ref<TripWithPhotos | null>(null)
const sections = ref<Section[]>([])
const loading = ref(true)
const error = ref('')

// Description editing state
type SaveState = 'saving' | 'saved' | 'error'
const drafts = reactive<Record<string, string>>({})
const saveState = reactive<Record<string, SaveState>>({})
const saveTimeouts: Record<string, number> = {}
const savedTimeouts: Record<string, number> = {}

// Section editing state
const newSectionTitle = ref('')
const creatingSection = ref(false)
const editingSectionId = ref<string | null>(null)
const editingTitle = ref('')
const reordering = ref(false)
const sectionToDelete = ref<Section | null>(null)
const deletingSection = ref(false)

const pendingCount = computed(
  () =>
    Object.keys(saveTimeouts).length + Object.values(saveState).filter(s => s === 'saving').length
)
const errorCount = computed(() => Object.values(saveState).filter(s => s === 'error').length)
const hasUnsavedChanges = computed(() => pendingCount.value > 0)

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadTrip() {
  loading.value = true
  error.value = ''
  try {
    const tripIdParam = route.params.tripId
    const tripId = Array.isArray(tripIdParam) ? tripIdParam[0] : tripIdParam
    if (!tripId) throw new Error('Trip ID is missing from the URL.')

    trip.value = await getTripByIdWithAllPhotos(tripId)
    if (!trip.value) {
      error.value = 'Trip not found'
      return
    }
    sections.value = [...trip.value.sections].sort((a, b) => a.orderIndex - b.orderIndex)
  } catch (err) {
    console.error('[WorkshopView] Error loading trip:', err)
    error.value = 'Failed to load trip'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push('/admin/trips')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function photoCountFor(sectionId: string): number {
  return trip.value?.photos.filter(p => p.section_id === sectionId).length ?? 0
}

function sectionTitleFor(sectionId: string | null): string | null {
  if (!sectionId) return null
  return sections.value.find(s => s.id === sectionId)?.title ?? null
}

function descriptionLength(photo: Photo): number {
  return (drafts[photo.id] ?? photo.description ?? '').length
}

function autoResize(event: Event) {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function showError(message: string) {
  toast({ title: 'Error', description: message, variant: 'destructive' })
}

// ---------------------------------------------------------------------------
// Descriptions (auto-save: debounced while typing, immediate on blur)
// ---------------------------------------------------------------------------

function onDescriptionInput(photo: Photo, value: string) {
  drafts[photo.id] = value
  if (saveTimeouts[photo.id]) clearTimeout(saveTimeouts[photo.id])
  saveTimeouts[photo.id] = window.setTimeout(() => flushDescription(photo), SAVE_DEBOUNCE_MS)
}

async function flushDescription(photo: Photo) {
  if (saveTimeouts[photo.id]) {
    clearTimeout(saveTimeouts[photo.id])
    delete saveTimeouts[photo.id]
  }
  const draft = drafts[photo.id]
  if (draft === undefined) return
  const next = draft.trim() || null
  if (next === (photo.description ?? null)) {
    delete drafts[photo.id]
    return
  }

  saveState[photo.id] = 'saving'
  try {
    await updatePhotoDescription(photo.id, next)
    photo.description = next
    // Keep draft only if the user typed more while saving
    if (drafts[photo.id] === draft) delete drafts[photo.id]
    saveState[photo.id] = 'saved'
    if (savedTimeouts[photo.id]) clearTimeout(savedTimeouts[photo.id])
    savedTimeouts[photo.id] = window.setTimeout(() => {
      if (saveState[photo.id] === 'saved') delete saveState[photo.id]
    }, 2000)
  } catch (err) {
    console.error('[WorkshopView] Failed to save description:', err)
    saveState[photo.id] = 'error'
  }
}

// ---------------------------------------------------------------------------
// Photo → section assignment
// ---------------------------------------------------------------------------

async function handleSectionChange(photo: Photo, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const next = value || null
  const previous = photo.section_id
  photo.section_id = next // optimistic
  try {
    await updatePhotoSection(photo.id, next)
  } catch (err) {
    console.error('[WorkshopView] Failed to assign section:', err)
    photo.section_id = previous
    showError('Failed to assign section. Please try again.')
  }
}

// ---------------------------------------------------------------------------
// Section CRUD
// ---------------------------------------------------------------------------

function nextOrderIndex(): number {
  return sections.value.reduce((max, s) => Math.max(max, s.orderIndex + 1), 0)
}

async function handleCreateSection() {
  const title = newSectionTitle.value.trim()
  if (!title || !trip.value) return
  creatingSection.value = true
  try {
    const section = await createSection(trip.value.id, title, nextOrderIndex())
    sections.value.push(section)
    newSectionTitle.value = ''
  } catch (err) {
    console.error('[WorkshopView] Failed to create section:', err)
    showError('Failed to create section. Please try again.')
  } finally {
    creatingSection.value = false
  }
}

function startRename(section: Section) {
  editingSectionId.value = section.id
  editingTitle.value = section.title
}

function cancelRename() {
  editingSectionId.value = null
}

async function commitRename(section: Section) {
  if (editingSectionId.value !== section.id) return
  editingSectionId.value = null
  const title = editingTitle.value.trim()
  if (!title || title === section.title) return
  const previous = section.title
  section.title = title // optimistic
  try {
    await updateSection(section.id, { title })
  } catch (err) {
    console.error('[WorkshopView] Failed to rename section:', err)
    section.title = previous
    showError('Failed to rename section. Please try again.')
  }
}

/**
 * Swap orderIndex with the neighbour. orderIndex is unique per trip, so the
 * moving section is parked at a free index first to avoid a conflict.
 */
async function moveSection(index: number, delta: number) {
  const a = sections.value[index]
  const b = sections.value[index + delta]
  if (!a || !b || reordering.value) return
  reordering.value = true
  const aIndex = a.orderIndex
  const bIndex = b.orderIndex
  const parking = nextOrderIndex()
  try {
    await updateSection(a.id, { orderIndex: parking })
    await updateSection(b.id, { orderIndex: aIndex })
    await updateSection(a.id, { orderIndex: bIndex })
    a.orderIndex = bIndex
    b.orderIndex = aIndex
    sections.value.sort((x, y) => x.orderIndex - y.orderIndex)
  } catch (err) {
    console.error('[WorkshopView] Failed to reorder sections:', err)
    showError('Failed to reorder sections. Reloading.')
    await loadTrip()
  } finally {
    reordering.value = false
  }
}

async function confirmDeleteSection() {
  const section = sectionToDelete.value
  if (!section) return
  deletingSection.value = true
  try {
    await deleteSection(section.id)
    sections.value = sections.value.filter(s => s.id !== section.id)
    trip.value?.photos.forEach(p => {
      if (p.section_id === section.id) p.section_id = null
    })
    sectionToDelete.value = null
  } catch (err) {
    console.error('[WorkshopView] Failed to delete section:', err)
    showError('Failed to delete section. Please try again.')
  } finally {
    deletingSection.value = false
  }
}

// ---------------------------------------------------------------------------
// Unsaved-changes guards
// ---------------------------------------------------------------------------

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) return
  e.preventDefault()
}

onBeforeRouteLeave(() => {
  if (!hasUnsavedChanges.value) return true
  return window.confirm('Some descriptions are still saving. Leave anyway?')
})

onMounted(() => {
  loadTrip()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  Object.values(saveTimeouts).forEach(clearTimeout)
  Object.values(savedTimeouts).forEach(clearTimeout)
})
</script>

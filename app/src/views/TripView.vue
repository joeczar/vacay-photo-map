<template>
  <TripLayout>
    <template #actions>
      <!-- Admin-only actions -->
      <template v-if="isAuthenticated">
        <Button variant="outline" class="w-full justify-start" @click="shareSheetOpen = true">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          Share
        </Button>

        <Button variant="destructive" class="w-full justify-start" @click="deleteDialogOpen = true">
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          Delete Trip
        </Button>
      </template>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div
          class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"
        ></div>
        <p class="text-muted-foreground">Loading trip...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <h2 class="text-2xl font-bold mb-2">Trip Not Found</h2>
        <p class="text-muted-foreground mb-4">{{ error }}</p>
        <Button as-child>
          <router-link to="/">← Back to Home</router-link>
        </Button>
      </div>
    </div>

    <!-- Trip Content -->
    <div v-else-if="trip">
      <!-- Hero Section -->
      <div class="border-b bg-card">
        <div class="container py-8 px-4">
          <h1 class="text-4xl font-bold mb-2">{{ trip.title }}</h1>
          <p v-if="trip.description" class="text-muted-foreground mb-4">{{ trip.description }}</p>
          <div class="flex gap-4">
            <Badge variant="secondary">
              <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clip-rule="evenodd"
                />
              </svg>
              {{ trip.photos.length }} photos
            </Badge>
            <Badge v-if="dateRange" variant="outline">{{ dateRange }}</Badge>
            <Badge v-if="photosWithLocation" variant="outline"
              >{{ photosWithLocation }} locations</Badge
            >
          </div>
        </div>
      </div>

      <!-- Map Section -->
      <div class="container py-8 px-4">
        <Card class="overflow-hidden">
          <div style="height: 600px" class="relative z-0">
            <l-map
              ref="map"
              v-model:zoom="zoom"
              :center="mapCenter as [number, number]"
              :options="{ scrollWheelZoom: true }"
              @ready="onMapReady"
            >
              <l-tile-layer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

              <!-- Photo Markers -->
              <l-marker
                v-for="photo in photosWithCoordinates"
                :key="photo.id"
                :lat-lng="[photo.latitude!, photo.longitude!]"
                @click="selectPhoto(photo)"
              >
                <l-icon :icon-size="[40, 40]" :icon-anchor="[20, 40]">
                  <div class="relative">
                    <div
                      class="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden cursor-pointer hover:scale-110 transition-transform"
                      :class="selectedPhoto?.id === photo.id ? 'border-primary border-4' : ''"
                    >
                      <img
                        :src="photo.thumbnail_url"
                        :alt="photo.caption || 'Photo'"
                        class="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </l-icon>

                <l-popup :options="{ maxWidth: 300 }">
                  <div class="p-2">
                    <img
                      :src="photo.url"
                      :alt="photo.caption || 'Photo'"
                      class="w-full h-48 object-cover rounded mb-2"
                    />
                    <p v-if="photo.caption" class="text-sm font-medium mb-1">{{ photo.caption }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatDate(photo.taken_at) }}</p>
                  </div>
                </l-popup>
              </l-marker>

              <!-- Route Line -->
              <l-polyline
                v-if="routeCoordinates.length > 0"
                :lat-lngs="routeCoordinates as [number, number][]"
                :weight="3"
                color="#3B82F6"
              />
            </l-map>
          </div>

          <!-- Photo Grid Below Map -->
          <Separator />
          <CardContent class="p-6">
            <h3 class="text-lg font-semibold mb-4">All Photos</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Card
                v-for="photo in trip.photos"
                :key="photo.id"
                class="relative aspect-square cursor-pointer overflow-hidden group hover:ring-2 hover:ring-primary transition-all"
                :class="selectedPhoto?.id === photo.id ? 'ring-2 ring-primary' : ''"
                @click="selectPhoto(photo)"
              >
                <img
                  :src="photo.thumbnail_url"
                  :alt="photo.caption || 'Photo'"
                  class="w-full h-full object-cover"
                />
                <div
                  v-if="!photo.latitude || !photo.longitude"
                  class="absolute top-1 right-1 bg-yellow-500 rounded-full p-1"
                  title="No location data"
                >
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Delete Confirmation Dialog -->
      <Dialog v-model:open="deleteDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Trip?</DialogTitle>
            <DialogDescription>
              This will permanently delete "{{ trip.title }}" and all
              {{ trip.photos.length }} photos. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" @click="deleteDialogOpen = false">Cancel</Button>
            <Button variant="destructive" @click="confirmDelete" :disabled="isDeleting">
              {{ isDeleting ? 'Deleting...' : 'Delete' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Share Sheet -->
      <Sheet v-model:open="shareSheetOpen">
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Share Trip</SheetTitle>
            <SheetDescription> Control who can access this trip </SheetDescription>
          </SheetHeader>

          <div class="py-6 space-y-6">
            <!-- Public/Private Toggle -->
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <Label for="public-toggle" class="text-base">Public Trip</Label>
                <p class="text-sm text-muted-foreground">
                  {{
                    localIsPublic
                      ? 'Anyone can view this trip'
                      : 'Only people with the link can view'
                  }}
                </p>
              </div>
              <Switch
                id="public-toggle"
                :checked="localIsPublic"
                :disabled="isUpdatingProtection"
                @update:checked="handlePublicToggle"
              />
            </div>

            <Separator />

            <!-- Share Link Section (only for private trips) -->
            <div v-if="!localIsPublic" class="space-y-4">
              <div class="space-y-2">
                <Label class="text-base">Share Link</Label>
                <p class="text-sm text-muted-foreground">
                  {{
                    shareLink
                      ? 'Share this link with people you want to access the trip'
                      : 'Generate a secure link to share this trip'
                  }}
                </p>
              </div>

              <!-- Link Preview -->
              <div v-if="shareLink" class="space-y-3">
                <div class="flex items-center gap-2">
                  <Input :value="shareLink" readonly class="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    @click="copyShareLink"
                    :disabled="isCopying"
                  >
                    <svg
                      v-if="copySuccess"
                      class="w-4 h-4 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <svg
                      v-else
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </Button>
                </div>

                <!-- Regenerate Link -->
                <Button
                  variant="outline"
                  class="w-full"
                  @click="regenerateDialogOpen = true"
                  :disabled="isUpdatingProtection"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Regenerate Link
                </Button>
              </div>

              <!-- Generate Link Button -->
              <Button
                v-else
                class="w-full"
                @click="generateShareLink"
                :disabled="isUpdatingProtection"
              >
                <svg
                  v-if="isUpdatingProtection"
                  class="w-4 h-4 mr-2 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <svg
                  v-else
                  class="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                {{ isUpdatingProtection ? 'Generating...' : 'Generate Share Link' }}
              </Button>
            </div>

            <!-- Error Message -->
            <Alert v-if="protectionError" variant="destructive">
              <AlertDescription>{{ protectionError }}</AlertDescription>
            </Alert>
          </div>
        </SheetContent>
      </Sheet>

      <!-- Regenerate Link Confirmation Dialog -->
      <Dialog v-model:open="regenerateDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Share Link?</DialogTitle>
            <DialogDescription>
              This will create a new share link and invalidate the old one. Anyone with the previous
              link will no longer be able to access this trip.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" @click="regenerateDialogOpen = false">Cancel</Button>
            <Button @click="confirmRegenerate" :disabled="isUpdatingProtection">
              {{ isUpdatingProtection ? 'Regenerating...' : 'Regenerate' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Lightbox -->
      <div
        v-if="selectedPhoto"
        class="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
        @click="closePhoto"
      >
        <div class="relative max-w-6xl w-full" @click.stop>
          <Button
            variant="ghost"
            size="icon"
            @click="closePhoto"
            class="absolute -top-12 right-0 text-white hover:text-white/80"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>

          <img
            :src="selectedPhoto.url"
            :alt="selectedPhoto.caption || 'Photo'"
            class="w-full h-auto rounded-lg shadow-2xl"
          />

          <div class="mt-4 text-white">
            <p v-if="selectedPhoto.caption" class="text-lg font-medium mb-2">
              {{ selectedPhoto.caption }}
            </p>
            <p class="text-sm text-gray-300">{{ formatDate(selectedPhoto.taken_at) }}</p>
          </div>

          <!-- Navigation -->
          <Button
            v-if="currentPhotoIndex > 0"
            variant="ghost"
            size="icon"
            @click.stop="previousPhoto"
            class="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-white/80"
          >
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <Button
            v-if="currentPhotoIndex < trip.photos.length - 1"
            variant="ghost"
            size="icon"
            @click.stop="nextPhoto"
            class="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-white/80"
          >
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  </TripLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { LMap, LTileLayer, LMarker, LIcon, LPopup, LPolyline } from '@vue-leaflet/vue-leaflet'
import { getTripBySlug, deleteTrip, updateTripProtection } from '@/utils/database'
import { generateTripToken } from '@/utils/tokenGenerator'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/components/ui/toast/use-toast'
import type { Database } from '@/lib/database.types'
import TripLayout from '@/layouts/TripLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href
})

type Trip = Database['public']['Tables']['trips']['Row']
type Photo = Database['public']['Tables']['photos']['Row']

const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string
const token = route.query.token as string | undefined

// Auth
const { isAuthenticated, session } = useAuth()
const { toast } = useToast()

// State
const trip = ref<(Trip & { photos: Photo[] }) | null>(null)
const loading = ref(true)
const error = ref('')
const selectedPhoto = ref<Photo | null>(null)
const zoom = ref(12)
const map = ref(null)
const isDeleting = ref(false)
const deleteDialogOpen = ref(false)

// Share state
const shareSheetOpen = ref(false)
const localIsPublic = ref(true)
const shareLink = ref('')
const isUpdatingProtection = ref(false)
const protectionError = ref('')
const regenerateDialogOpen = ref(false)
const isCopying = ref(false)
const copySuccess = ref(false)

// Sync localIsPublic with trip data when sheet opens
watch(shareSheetOpen, open => {
  if (open && trip.value) {
    localIsPublic.value = trip.value.is_public
    shareLink.value = ''
    protectionError.value = ''
  }
})

// Load trip data
onMounted(async () => {
  try {
    const data = await getTripBySlug(slug, token)
    if (!data) {
      error.value = 'Trip not found'
    } else {
      trip.value = data
    }
  } catch (err) {
    console.error('Error loading trip:', err)

    // Handle 401 Unauthorized specifically
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
      error.value = 'This trip is private. Please use the link provided by the trip owner.'
    } else {
      error.value = 'Failed to load trip'
    }
  } finally {
    loading.value = false
  }
})

// Computed properties
const photosWithCoordinates = computed(() => {
  if (!trip.value) return []
  return trip.value.photos.filter(p => p.latitude !== null && p.longitude !== null)
})

const photosWithLocation = computed(() => photosWithCoordinates.value.length)

const mapCenter = computed(() => {
  if (photosWithCoordinates.value.length === 0) {
    return [40.7128, -74.006] // Default to NYC
  }

  // Calculate center of all photos
  const lats = photosWithCoordinates.value.map(p => p.latitude!)
  const lngs = photosWithCoordinates.value.map(p => p.longitude!)

  const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length
  const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length

  return [avgLat, avgLng]
})

const routeCoordinates = computed(() => {
  return photosWithCoordinates.value.map(p => [p.latitude!, p.longitude!])
})

const dateRange = computed(() => {
  if (!trip.value || trip.value.photos.length === 0) return ''

  const dates = trip.value.photos
    .map(p => new Date(p.taken_at))
    .sort((a, b) => a.getTime() - b.getTime())
  const start = dates[0]
  const end = dates[dates.length - 1]

  if (start.toDateString() === end.toDateString()) {
    return formatDate(start.toISOString())
  }

  return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`
})

const currentPhotoIndex = computed(() => {
  if (!selectedPhoto.value || !trip.value) return -1
  return trip.value.photos.findIndex(p => p.id === selectedPhoto.value!.id)
})

// Methods
function onMapReady() {
  // Fit map to show all markers
  if (map.value && photosWithCoordinates.value.length > 0) {
    const bounds = photosWithCoordinates.value.map(p => [p.latitude!, p.longitude!])
    ;(map.value as any).leafletObject.fitBounds(bounds, { padding: [50, 50] })
  }
}

function selectPhoto(photo: Photo) {
  selectedPhoto.value = photo

  // Pan map to photo location if it has coordinates
  if (photo.latitude && photo.longitude && map.value) {
    ;(map.value as any).leafletObject.panTo([photo.latitude, photo.longitude])
  }
}

function closePhoto() {
  selectedPhoto.value = null
}

function nextPhoto() {
  if (!trip.value || currentPhotoIndex.value >= trip.value.photos.length - 1) return
  selectedPhoto.value = trip.value.photos[currentPhotoIndex.value + 1]
}

function previousPhoto() {
  if (!trip.value || currentPhotoIndex.value <= 0) return
  selectedPhoto.value = trip.value.photos[currentPhotoIndex.value - 1]
}

async function confirmDelete() {
  if (!trip.value) return

  isDeleting.value = true

  try {
    await deleteTrip(trip.value.id)
    // Navigate back to home page after successful deletion
    router.push('/')
  } catch (err) {
    console.error('Error deleting trip:', err)
    alert('Failed to delete trip. Please try again.')
    isDeleting.value = false
    deleteDialogOpen.value = false
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Share methods
async function handlePublicToggle(checked: boolean) {
  if (!trip.value || !session.value?.access_token) return

  protectionError.value = ''
  isUpdatingProtection.value = true

  try {
    if (checked) {
      // Making public - clear token
      await updateTripProtection(trip.value.id, true, undefined, session.value.access_token)
      trip.value.is_public = true
      shareLink.value = ''
      toast({
        title: 'Trip is now public',
        description: 'Anyone can view this trip'
      })
    } else {
      // Making private - generate token immediately
      const newToken = generateTripToken()
      await updateTripProtection(trip.value.id, false, newToken, session.value.access_token)
      trip.value.is_public = false
      shareLink.value = buildShareLink(newToken)
      toast({
        title: 'Trip is now private',
        description: 'Share the link below with people you want to access it'
      })
    }
    localIsPublic.value = checked
  } catch (err) {
    console.error('Error updating trip protection:', err)
    protectionError.value = err instanceof Error ? err.message : 'Failed to update trip protection'
  } finally {
    isUpdatingProtection.value = false
  }
}

async function generateShareLink() {
  if (!trip.value || !session.value?.access_token) return

  protectionError.value = ''
  isUpdatingProtection.value = true

  try {
    const newToken = generateTripToken()
    await updateTripProtection(trip.value.id, false, newToken, session.value.access_token)
    trip.value.is_public = false
    localIsPublic.value = false
    shareLink.value = buildShareLink(newToken)
    toast({
      title: 'Share link generated',
      description: 'Copy the link and share it with others'
    })
  } catch (err) {
    console.error('Error generating share link:', err)
    protectionError.value = err instanceof Error ? err.message : 'Failed to generate share link'
  } finally {
    isUpdatingProtection.value = false
  }
}

async function confirmRegenerate() {
  regenerateDialogOpen.value = false
  await generateShareLink()
}

function buildShareLink(tokenValue: string): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/trip/${slug}?token=${tokenValue}`
}

async function copyShareLink() {
  if (!shareLink.value) return

  isCopying.value = true

  try {
    await navigator.clipboard.writeText(shareLink.value)
    copySuccess.value = true
    toast({
      title: 'Link copied',
      description: 'Share link has been copied to clipboard'
    })

    // Reset success icon after 2 seconds
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
    toast({
      title: 'Copy failed',
      description: 'Could not copy to clipboard. Please select and copy manually.',
      variant: 'destructive'
    })
  } finally {
    isCopying.value = false
  }
}
</script>

<style scoped>
/* Scoped z-index management for Leaflet map to prevent covering overlays */
:deep(.leaflet-container) {
  z-index: 0;
}

:deep(.leaflet-popup-pane) {
  z-index: 700;
}

:deep(.leaflet-control-container) {
  z-index: 800;
}
</style>

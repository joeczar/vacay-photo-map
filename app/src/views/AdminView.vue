<template>
  <AdminLayout>
    <!-- Header with link to Manage Trips -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">
        {{ isEditMode ? 'Edit Draft Trip' : 'Upload Trip' }}
      </h1>
      <Button as-child variant="outline" size="sm" class="btn-gradient-primary">
        <router-link to="/admin/trips">Manage Trips</router-link>
      </Button>
    </div>

    <!-- Success Message -->
    <Alert
      v-if="uploadComplete && tripSlug"
      variant="default"
      class="mb-6 bg-green-50 dark:bg-green-900/30 border-green-600"
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clip-rule="evenodd"
        />
      </svg>
      <AlertTitle>Trip Uploaded Successfully!</AlertTitle>
      <AlertDescription> Your trip is now live and ready to share. </AlertDescription>
      <div class="flex gap-3 mt-4">
        <Button as-child class="btn-gradient-primary">
          <router-link :to="`/trip/${tripSlug}`" target="_blank">View Trip</router-link>
        </Button>
        <Button variant="outline" class="btn-gradient-primary" @click="resetForm">
          Upload Another Trip
        </Button>
      </div>
    </Alert>

    <!-- Upload Form -->
    <Card v-else>
      <!-- Step 1: Trip Details -->
      <div v-if="currentStep === 1">
        <CardHeader>
          <CardTitle>{{ isEditMode ? 'Edit Trip' : 'Trip Details' }}</CardTitle>
          <CardDescription>
            {{
              isEditMode
                ? 'Update trip details and add more photos'
                : 'Upload your vacation photos with location data'
            }}
          </CardDescription>
        </CardHeader>

        <CardContent class="space-y-6">
          <!-- Loading State -->
          <div v-if="isLoadingTrip" class="flex items-center justify-center py-8">
            <div class="flex flex-col items-center gap-3">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p class="text-sm text-muted-foreground">Loading trip...</p>
            </div>
          </div>

          <form v-else @submit.prevent="onSubmit" class="space-y-6">
            <FormField v-slot="{ componentField }" name="tripTitle">
              <FormItem>
                <FormLabel>Trip Title *</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Summer Vacation 2024" v-bind="componentField" />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="tripDescription">
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us about your trip..."
                    rows="3"
                    v-bind="componentField"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Existing Photos (Edit Mode) -->
            <div v-if="isEditMode && existingPhotos.length > 0" class="space-y-2">
              <label class="text-sm font-medium leading-none">
                Existing Photos ({{ existingPhotos.length }})
              </label>
              <div
                class="flex md:grid md:grid-cols-4 gap-2 overflow-x-auto md:overflow-visible pb-2 snap-x"
              >
                <div
                  v-for="photo in existingPhotos"
                  :key="photo.id"
                  class="relative aspect-square w-28 h-28 md:w-auto md:h-auto shrink-0 snap-start"
                >
                  <img
                    :src="photo.thumbnail_url"
                    :alt="photo.caption || 'Photo'"
                    class="w-full h-full object-cover rounded border"
                    loading="lazy"
                    decoding="async"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    class="absolute top-1 right-1 bg-white/80 dark:bg-slate-800/80 hover:bg-white text-foreground h-7 w-7 rounded-full"
                    :aria-label="`Delete photo`"
                    title="Delete photo"
                    @click.stop="deletePhotoFromDraft(photo.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <label
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {{ isEditMode ? 'Add More Photos' : 'Select Photos *' }}
              </label>
              <div class="flex items-center gap-3">
                <Button
                  type="button"
                  class="h-11 px-5 btn-gradient-primary"
                  @click="() => fileInput?.click()"
                  aria-label="Choose photos"
                  :aria-controls="fileInputId"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="mr-2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Choose Photos
                </Button>
                <span class="text-sm text-muted-foreground">
                  {{
                    selectedFiles.length > 0
                      ? `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}
                  selected`
                      : 'No files chosen'
                  }}
                </span>
              </div>
              <input
                ref="fileInput"
                :id="fileInputId"
                type="file"
                multiple
                accept="image/*"
                @change="handleFileSelect"
                class="hidden"
              />
              <p class="text-sm text-muted-foreground">Select multiple photos from your trip</p>
            </div>

            <div v-if="selectedFiles.length > 0" class="mt-4">
              <p class="text-sm mb-2">{{ selectedFiles.length }} photos selected</p>
              <div
                class="flex md:grid md:grid-cols-4 gap-2 overflow-x-auto md:overflow-visible pb-2 snap-x"
              >
                <div
                  v-for="(file, index) in selectedFiles"
                  :key="index"
                  class="relative aspect-square w-28 h-28 md:w-auto md:h-auto shrink-0 snap-start"
                >
                  <img
                    :src="getFilePreview(file)"
                    :alt="file.name"
                    class="w-full h-full object-cover rounded border"
                    loading="lazy"
                    decoding="async"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    class="absolute top-1 right-1 bg-white/80 dark:bg-slate-800/80 hover:bg-white text-foreground h-7 w-7 rounded-full"
                    :aria-label="`Remove ${file.name}`"
                    title="Remove photo"
                    @click.stop="removeFile(index)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>

            <div class="flex gap-3">
              <Button
                type="submit"
                :disabled="!meta.valid || selectedFiles.length === 0 || isUploading"
                class="btn-gradient-primary"
              >
                {{ isUploading ? 'Processing...' : isEditMode ? 'Add Photos' : 'Start Upload' }}
              </Button>

              <Button
                v-if="isEditMode"
                type="button"
                variant="outline"
                :disabled="existingPhotos.length === 0 || isUploading"
                class="btn-gradient-primary"
                @click="publishTrip"
              >
                Publish Trip
              </Button>
            </div>
          </form>
        </CardContent>
      </div>

      <!-- Step 2: Upload Progress -->
      <div v-if="currentStep === 2">
        <CardHeader>
          <CardTitle>Uploading Trip...</CardTitle>
          <CardDescription>{{ uploadStatus }}</CardDescription>
        </CardHeader>

        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>Progress</span>
              <span>{{ uploadProgress }}%</span>
            </div>
            <Progress :model-value="uploadProgress" />
          </div>

          <Alert v-if="error" variant="destructive">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>

          <!-- Failed uploads with retry -->
          <div v-if="failedUploads.length > 0" class="space-y-3">
            <Alert variant="destructive">
              <AlertDescription>
                {{ failedUploads.length }} photo{{ failedUploads.length > 1 ? 's' : '' }} failed to
                upload
              </AlertDescription>
            </Alert>
            <div class="text-sm text-muted-foreground space-y-1">
              <div v-for="failed in failedUploads" :key="failed.index" class="flex justify-between">
                <span class="truncate max-w-[70%]">{{ failed.filename }}</span>
                <span class="text-destructive">{{ failed.error }}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" @click="retryFailedUploads" :disabled="isUploading">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Retry Failed
            </Button>
          </div>

          <!-- Per-file progress list -->
          <div v-if="selectedFiles.length > 0" class="mt-2 space-y-3">
            <div v-for="(file, i) in selectedFiles" :key="file.name + i" class="space-y-1">
              <div class="flex justify-between text-xs text-muted-foreground">
                <span class="truncate max-w-[60%]">{{ file.name }}</span>
                <span>{{ perFileProgress[i] || 0 }}%</span>
              </div>
              <Progress :model-value="perFileProgress[i] || 0" />
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { extractExifBatch } from '@/utils/exif'
import { resizeFiles } from '@/utils/resize'
import { createTrip, createPhotos, updateTrip, getTripById, deletePhoto } from '@/utils/database'
import { generateUniqueSlug } from '@/utils/slug'
import type { PhotoMetadata } from '@/utils/exif'
import type { TablesRow } from '@/lib/database.types'
import { useAuth } from '@/composables/useAuth'

type Photo = TablesRow<'photos'>
import AdminLayout from '@/layouts/AdminLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { uploadMultipleFiles, uploadPhoto, type UploadError, type UploadResult } from '@/lib/upload'

const router = useRouter()
const route = useRoute()

// Form validation schema
const formSchema = toTypedSchema(
  z.object({
    tripTitle: z
      .string()
      .min(3, 'Trip title must be at least 3 characters')
      .max(100, 'Trip title must be less than 100 characters'),
    tripDescription: z.string().max(500, 'Description must be less than 500 characters').optional()
  })
)

const {
  handleSubmit,
  resetForm: resetVeeForm,
  meta
} = useForm({
  validationSchema: formSchema,
  initialValues: {
    tripTitle: '',
    tripDescription: ''
  }
})

// Form state
const currentStep = ref(1)
const selectedFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const fileInputId = 'photo-input'
const previews = ref(new Map<File, string>())

// Upload state
const isUploading = ref(false)
const uploadStatus = ref('')
const uploadProgress = ref(0)
const perFileProgress = ref<number[]>([])
const error = ref('')
const uploadComplete = ref(false)
const tripSlug = ref('')
const failedUploads = ref<UploadError[]>([])
const currentTripId = ref<string | null>(null)
const uploadResults = ref<(UploadResult | null)[]>([])

// Edit mode state
const isEditMode = ref(false)
const existingPhotos = ref<Photo[]>([])
const isLoadingTrip = ref(false)

// File selection
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    const newFiles = Array.from(target.files)
    // Append new files to existing selection
    selectedFiles.value = [...selectedFiles.value, ...newFiles]
    // Build previews for new files only
    newFiles.forEach(f => previews.value.set(f, URL.createObjectURL(f)))
    perFileProgress.value = new Array(selectedFiles.value.length).fill(0)
    // Reset input so same file can be selected again
    target.value = ''
  }
}

function getFilePreview(file: File): string {
  const cached = previews.value.get(file)
  if (cached) return cached
  const url = URL.createObjectURL(file)
  previews.value.set(file, url)
  return url
}

function removeFile(index: number) {
  const file = selectedFiles.value[index]
  if (!file) return
  const url = previews.value.get(file)
  if (url) {
    URL.revokeObjectURL(url)
    previews.value.delete(file)
  }
  selectedFiles.value.splice(index, 1)
  if (selectedFiles.value.length === 0 && fileInput.value) {
    fileInput.value.value = ''
  }
}

// Upload process - wrapped with validation
const onSubmit = handleSubmit(async formValues => {
  isUploading.value = true
  currentStep.value = 2
  error.value = ''

  try {
    // Step 1: Extract EXIF data
    uploadStatus.value = 'Extracting photo metadata...'
    uploadProgress.value = 10
    const exifData = await extractExifBatch(selectedFiles.value)

    // Step 2: Resize/optimize images client-side
    uploadStatus.value = 'Optimizing photos for upload...'
    uploadProgress.value = 20
    const optimizedFiles = await resizeFiles(selectedFiles.value, { maxSize: 1600, quality: 0.85 })

    // Step 3: Create trip as draft FIRST (skip if in edit mode)
    let tripId: string
    let slug: string

    if (currentTripId.value) {
      // Edit mode - update trip details first, then add photos
      await updateTrip(currentTripId.value, {
        title: formValues.tripTitle,
        description: formValues.tripDescription || null
      })
      uploadStatus.value = 'Adding photos to trip...'
      uploadProgress.value = 25
      tripId = currentTripId.value
      slug = tripSlug.value
    } else {
      // Create mode - create new trip
      uploadStatus.value = 'Creating trip...'
      uploadProgress.value = 25

      slug = generateUniqueSlug(formValues.tripTitle)
      const trip = await createTrip({
        title: formValues.tripTitle,
        description: formValues.tripDescription || null,
        slug,
        is_public: false, // Draft state
        cover_photo_url: null
      })
      tripId = trip.id
      currentTripId.value = trip.id
    }

    // Step 4: Upload photos to our API
    uploadStatus.value = 'Uploading photos...'
    uploadProgress.value = 30

    const { getToken } = useAuth()
    const token = getToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    // Initialize per-file progress
    perFileProgress.value = new Array(optimizedFiles.length).fill(0)

    const { results, errors } = await uploadMultipleFiles(
      tripId,
      optimizedFiles,
      token,
      (fileIndex, progress) => {
        const baseProgress = 30
        const uploadWeight = 50
        const fileProgress = (fileIndex / optimizedFiles.length) * uploadWeight
        const currentFileProgress =
          (progress.percentage / 100) * (uploadWeight / optimizedFiles.length)
        uploadProgress.value = Math.round(baseProgress + fileProgress + currentFileProgress)
        perFileProgress.value[fileIndex] = Math.max(
          0,
          Math.min(100, Math.round(progress.percentage))
        )
      }
    )

    // Track results and errors for potential retry
    uploadResults.value = results
    failedUploads.value = errors

    // Step 5: Save successful photos to database
    uploadStatus.value = 'Saving photos...'
    uploadProgress.value = 85

    const photoInserts = selectedFiles.value
      .map((file, index) => {
        const uploadResult = results[index]
        if (!uploadResult) return null // Skip failed uploads

        const metadata = exifData.get(file) as PhotoMetadata
        return {
          trip_id: tripId,
          storage_key: uploadResult.publicId,
          url: uploadResult.url,
          thumbnail_url: uploadResult.thumbnailUrl,
          latitude: metadata.latitude || null,
          longitude: metadata.longitude || null,
          taken_at: metadata.takenAt?.toISOString() || new Date().toISOString(),
          caption: null
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (photoInserts.length > 0) {
      const createdPhotos = await createPhotos(photoInserts)
      // Add newly created photos to existing photos list (for edit mode)
      existingPhotos.value = [...existingPhotos.value, ...createdPhotos]
    }

    // Step 6: Set cover photo and update trip to public (only if not in edit mode)
    uploadStatus.value = 'Finalizing trip...'
    uploadProgress.value = 95

    if (!isEditMode.value && photoInserts.length > 0) {
      const coverPhoto = photoInserts.find(p => p.latitude && p.longitude) || photoInserts[0]
      await updateTrip(tripId, {
        coverPhotoUrl: coverPhoto?.thumbnail_url,
        isPublic: true
      })
    } else if (isEditMode.value && photoInserts.length > 0) {
      // In edit mode, just update the cover photo but keep draft status
      const allPhotos = [...existingPhotos.value]
      const coverPhoto = allPhotos.find(p => p.latitude && p.longitude) || allPhotos[0]
      await updateTrip(tripId, {
        coverPhotoUrl: coverPhoto?.thumbnail_url
      })
    }

    // Done (with possible partial failures)
    uploadProgress.value = 100
    tripSlug.value = slug
    uploadComplete.value = true

    if (errors.length > 0) {
      uploadStatus.value = `${photoInserts.length} uploaded, ${errors.length} failed`
    } else {
      uploadStatus.value = 'Complete!'
    }
  } catch (err) {
    console.error('Upload error:', err)
    error.value = err instanceof Error ? err.message : 'Upload failed. Please try again.'
  } finally {
    isUploading.value = false
  }
})

function resetForm() {
  currentStep.value = 1
  resetVeeForm()
  selectedFiles.value = []
  previews.value.forEach(url => URL.revokeObjectURL(url))
  previews.value.clear()
  uploadComplete.value = false
  uploadProgress.value = 0
  uploadStatus.value = ''
  error.value = ''
  tripSlug.value = ''
  failedUploads.value = []
  currentTripId.value = null
  uploadResults.value = []
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

async function retryFailedUploads() {
  if (!currentTripId.value || failedUploads.value.length === 0) return

  const { getToken } = useAuth()
  const token = getToken()
  if (!token) return

  isUploading.value = true
  uploadStatus.value = 'Retrying failed uploads...'

  const failedIndices = failedUploads.value.map(e => e.index)
  const filesToRetry = failedIndices.map(i => selectedFiles.value[i])
  const newErrors: UploadError[] = []

  for (let i = 0; i < filesToRetry.length; i++) {
    const file = filesToRetry[i]
    const originalIndex = failedIndices[i]

    try {
      const result = await uploadPhoto(currentTripId.value, file, token)
      uploadResults.value[originalIndex] = result

      // Save to database
      const exifData = await import('@/utils/exif').then(m => m.extractExif(file))
      await createPhotos([
        {
          trip_id: currentTripId.value,
          storage_key: result.publicId,
          url: result.url,
          thumbnail_url: result.thumbnailUrl,
          latitude: exifData.latitude || null,
          longitude: exifData.longitude || null,
          taken_at: exifData.takenAt?.toISOString() || new Date().toISOString(),
          caption: null
        }
      ])
    } catch (err) {
      newErrors.push({
        index: originalIndex,
        filename: file.name,
        error: err instanceof Error ? err.message : 'Retry failed'
      })
    }
  }

  failedUploads.value = newErrors
  isUploading.value = false

  if (newErrors.length === 0) {
    uploadStatus.value = 'All photos uploaded!'
  } else {
    uploadStatus.value = `${filesToRetry.length - newErrors.length} recovered, ${newErrors.length} still failed`
  }
}

// Delete a photo from the draft trip
async function deletePhotoFromDraft(photoId: string) {
  try {
    await deletePhoto(photoId)
    // Remove from UI
    existingPhotos.value = existingPhotos.value.filter(p => p.id !== photoId)
  } catch (err) {
    console.error('Failed to delete photo:', err)
    error.value = err instanceof Error ? err.message : 'Failed to delete photo'
  }
}

// Publish the draft trip
const publishTrip = handleSubmit(async formValues => {
  if (!currentTripId.value || !tripSlug.value) return

  try {
    let updatePayload: {
      title: string
      description: string | null
      isPublic: boolean
      coverPhotoUrl?: string | null
    } = {
      title: formValues.tripTitle,
      description: formValues.tripDescription || null,
      isPublic: true
    }

    // Recalculate cover photo from remaining photos
    if (existingPhotos.value.length > 0) {
      const coverPhoto =
        existingPhotos.value.find(p => p.latitude && p.longitude) || existingPhotos.value[0]
      updatePayload.coverPhotoUrl = coverPhoto?.thumbnail_url
    } else {
      updatePayload.coverPhotoUrl = null
    }

    await updateTrip(currentTripId.value, updatePayload)

    // Redirect to trip view
    router.push(`/trip/${tripSlug.value}`)
  } catch (err) {
    console.error('Failed to publish trip:', err)
    error.value = err instanceof Error ? err.message : 'Failed to publish trip'
  }
})

// Load trip in edit mode if tripId query param present
onMounted(async () => {
  const tripIdQuery = route.query.tripId
  const tripId = (Array.isArray(tripIdQuery) ? tripIdQuery[0] : tripIdQuery) as string | undefined

  if (tripId) {
    isEditMode.value = true
    isLoadingTrip.value = true

    try {
      const trip = await getTripById(tripId)

      if (trip) {
        currentTripId.value = trip.id
        tripSlug.value = trip.slug
        existingPhotos.value = trip.photos

        // Populate form with existing data
        resetVeeForm({
          values: {
            tripTitle: trip.title,
            tripDescription: trip.description || ''
          }
        })
      } else {
        error.value = 'Trip not found'
      }
    } catch (err) {
      console.error('Failed to load trip:', err)
      error.value = err instanceof Error ? err.message : 'Failed to load trip'
    } finally {
      isLoadingTrip.value = false
    }
  }
})
</script>

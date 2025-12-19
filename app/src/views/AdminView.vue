<template>
  <MainLayout>
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
          <CardTitle>Trip Details</CardTitle>
          <CardDescription>Upload your vacation photos with location data</CardDescription>
        </CardHeader>

        <CardContent class="space-y-6">
          <form @submit.prevent="onSubmit" class="space-y-6">
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

            <div class="space-y-2">
              <label
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Select Photos *
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

            <Button
              type="submit"
              :disabled="!meta.valid || selectedFiles.length === 0 || isUploading"
              class="btn-gradient-primary"
            >
              {{ isUploading ? 'Processing...' : 'Start Upload' }}
            </Button>
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
  </MainLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { extractExifBatch } from '@/utils/exif'
import { resizeFiles } from '@/utils/resize'
import { createTrip, createPhotos, updateTripCoverPhoto } from '@/utils/database'
import { generateUniqueSlug } from '@/utils/slug'
import type { PhotoMetadata } from '@/utils/exif'
import MainLayout from '@/layouts/MainLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { uploadMultipleFiles } from '@/lib/cloudinary'

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

// File selection
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    // Revoke any existing previews and reset
    previews.value.forEach(url => URL.revokeObjectURL(url))
    previews.value.clear()
    selectedFiles.value = Array.from(target.files)
    // Build new previews
    selectedFiles.value.forEach(f => previews.value.set(f, URL.createObjectURL(f)))
    perFileProgress.value = new Array(selectedFiles.value.length).fill(0)
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

    // Step 3: Upload to Cloudinary
    uploadStatus.value = 'Uploading photos to cloud storage...'
    uploadProgress.value = 30

    // Initialize per-file progress
    perFileProgress.value = new Array(optimizedFiles.length).fill(0)
    const uploadResults = await uploadMultipleFiles(optimizedFiles, (fileIndex, progress) => {
      const baseProgress = 20
      const uploadWeight = 50
      const fileProgress = (fileIndex / optimizedFiles.length) * uploadWeight
      const currentFileProgress =
        (progress.percentage / 100) * (uploadWeight / optimizedFiles.length)
      uploadProgress.value = Math.round(baseProgress + fileProgress + currentFileProgress)
      perFileProgress.value[fileIndex] = Math.max(0, Math.min(100, Math.round(progress.percentage)))
    })

    // Step 4: Create trip in database
    uploadStatus.value = 'Creating trip...'
    uploadProgress.value = 75

    const slug = generateUniqueSlug(formValues.tripTitle)
    const trip = await createTrip({
      title: formValues.tripTitle,
      description: formValues.tripDescription || null,
      slug,
      is_public: true,
      cover_photo_url: null
    })

    // Step 5: Save photos to database
    uploadStatus.value = 'Saving photos...'
    uploadProgress.value = 85

    const photoInserts = selectedFiles.value.map((file, index) => {
      const metadata = exifData.get(file) as PhotoMetadata
      const uploadResult = uploadResults[index]

      return {
        trip_id: trip.id,
        cloudinary_public_id: uploadResult.publicId,
        url: uploadResult.url,
        thumbnail_url: uploadResult.thumbnailUrl,
        latitude: metadata.latitude || null,
        longitude: metadata.longitude || null,
        taken_at: metadata.takenAt?.toISOString() || new Date().toISOString(),
        caption: null
      }
    })

    await createPhotos(photoInserts)

    // Step 6: Set cover photo (first photo with location, or just first photo)
    const coverPhoto = photoInserts.find(p => p.latitude && p.longitude) || photoInserts[0]
    if (coverPhoto) {
      await updateTripCoverPhoto(trip.id, coverPhoto.thumbnail_url)
    }

    // Done!
    uploadStatus.value = 'Complete!'
    uploadProgress.value = 100
    tripSlug.value = slug
    uploadComplete.value = true
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
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

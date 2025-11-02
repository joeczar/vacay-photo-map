<template>
  <MainLayout>
    <!-- Success Message -->
    <Alert v-if="uploadComplete && tripSlug" variant="default" class="mb-6 bg-green-50 dark:bg-green-900/30 border-green-600">
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
      </svg>
      <AlertTitle>Trip Uploaded Successfully!</AlertTitle>
      <AlertDescription>
        Your trip is now live and ready to share.
      </AlertDescription>
      <div class="flex gap-3 mt-4">
        <Button as-child>
          <a :href="`/trip/${tripSlug}`" target="_blank">View Trip</a>
        </Button>
        <Button variant="outline" @click="resetForm">
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
          <div>
            <label class="block text-sm font-medium mb-2">Trip Title *</label>
            <input
              v-model="tripTitle"
              type="text"
              required
              placeholder="Summer Vacation 2024"
              class="input"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Description (optional)</label>
            <textarea
              v-model="tripDescription"
              rows="3"
              placeholder="Tell us about your trip..."
              class="input"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Select Photos *</label>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept="image/*"
              @change="handleFileSelect"
              class="input"
            />
            <p class="mt-2 text-sm text-muted-foreground">Select multiple photos from your trip</p>
          </div>

          <div v-if="selectedFiles.length > 0" class="mt-4">
            <p class="text-sm mb-2">{{ selectedFiles.length }} photos selected</p>
            <div class="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              <div v-for="(file, index) in selectedFiles" :key="index" class="relative aspect-square">
                <img
                  :src="getFilePreview(file)"
                  :alt="file.name"
                  class="w-full h-full object-cover rounded border"
                />
              </div>
            </div>
          </div>

          <Button
            @click="startUpload"
            :disabled="!tripTitle || selectedFiles.length === 0 || isUploading"
            class="w-full"
          >
            {{ isUploading ? 'Processing...' : 'Start Upload' }}
          </Button>
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
        </CardContent>
      </div>
    </Card>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { extractExifBatch } from '@/utils/exif'
import { uploadMultipleFiles } from '@/lib/cloudinary'
import { createTrip, createPhotos, updateTripCoverPhoto } from '@/utils/database'
import { generateUniqueSlug } from '@/utils/slug'
import type { PhotoMetadata } from '@/utils/exif'
import MainLayout from '@/layouts/MainLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'

// Form state
const currentStep = ref(1)
const tripTitle = ref('')
const tripDescription = ref('')
const selectedFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

// Upload state
const isUploading = ref(false)
const uploadStatus = ref('')
const uploadProgress = ref(0)
const error = ref('')
const uploadComplete = ref(false)
const tripSlug = ref('')

// File selection
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    selectedFiles.value = Array.from(target.files)
  }
}

function getFilePreview(file: File): string {
  return URL.createObjectURL(file)
}

// Upload process
async function startUpload() {
  if (!tripTitle.value || selectedFiles.value.length === 0) return

  isUploading.value = true
  currentStep.value = 2
  error.value = ''

  try {
    // Step 1: Extract EXIF data
    uploadStatus.value = 'Extracting photo metadata...'
    uploadProgress.value = 10
    const exifData = await extractExifBatch(selectedFiles.value)

    // Step 2: Upload to Cloudinary
    uploadStatus.value = 'Uploading photos to cloud storage...'
    uploadProgress.value = 20

    const uploadResults = await uploadMultipleFiles(
      selectedFiles.value,
      (fileIndex, progress) => {
        const baseProgress = 20
        const uploadWeight = 50
        const fileProgress = (fileIndex / selectedFiles.value.length) * uploadWeight
        const currentFileProgress = (progress.percentage / 100) * (uploadWeight / selectedFiles.value.length)
        uploadProgress.value = Math.round(baseProgress + fileProgress + currentFileProgress)
      }
    )

    // Step 3: Create trip in database
    uploadStatus.value = 'Creating trip...'
    uploadProgress.value = 75

    const slug = generateUniqueSlug(tripTitle.value)
    const trip = await createTrip({
      title: tripTitle.value,
      description: tripDescription.value || null,
      slug,
      is_public: true,
      cover_photo_url: null
    })

    // Step 4: Save photos to database
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

    // Step 5: Set cover photo (first photo with location, or just first photo)
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
}

function resetForm() {
  currentStep.value = 1
  tripTitle.value = ''
  tripDescription.value = ''
  selectedFiles.value = []
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

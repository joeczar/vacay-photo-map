<template>
  <div class="min-h-screen bg-gray-100 dark:bg-slate-900">
    <header class="bg-white dark:bg-slate-800 shadow dark:shadow-slate-900/50">
      <div class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-slate-100">Upload Trip Photos</h1>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <!-- Success Message -->
      <div v-if="uploadComplete && tripSlug" class="mb-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
        <h3 class="text-green-800 dark:text-green-300 font-semibold mb-2">Trip Uploaded Successfully!</h3>
        <p class="text-green-700 dark:text-green-400 mb-3">Your trip is now live and ready to share.</p>
        <div class="flex gap-3">
          <a
            :href="`/trip/${tripSlug}`"
            target="_blank"
            class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            View Trip
          </a>
          <button
            @click="resetForm"
            class="px-4 py-2 bg-white dark:bg-slate-800 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-md hover:bg-green-50 dark:hover:bg-slate-700"
          >
            Upload Another Trip
          </button>
        </div>
      </div>

      <!-- Upload Form -->
      <div v-else class="bg-white dark:bg-slate-800 shadow dark:shadow-slate-900/50 rounded-lg p-6">
        <!-- Step 1: Trip Details -->
        <div v-if="currentStep === 1" class="space-y-6">
          <h2 class="text-xl font-semibold dark:text-slate-100 mb-4">Trip Details</h2>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Trip Title *</label>
            <input
              v-model="tripTitle"
              type="text"
              required
              placeholder="Summer Vacation 2024"
              class="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Description (optional)</label>
            <textarea
              v-model="tripDescription"
              rows="3"
              placeholder="Tell us about your trip..."
              class="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Select Photos *</label>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept="image/*"
              @change="handleFileSelect"
              class="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Select multiple photos from your trip</p>
          </div>

          <div v-if="selectedFiles.length > 0" class="mt-4">
            <p class="text-sm text-gray-700 dark:text-slate-300 mb-2">{{ selectedFiles.length }} photos selected</p>
            <div class="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              <div v-for="(file, index) in selectedFiles" :key="index" class="relative aspect-square">
                <img
                  :src="getFilePreview(file)"
                  :alt="file.name"
                  class="w-full h-full object-cover rounded border border-gray-200 dark:border-slate-700"
                />
              </div>
            </div>
          </div>

          <button
            @click="startUpload"
            :disabled="!tripTitle || selectedFiles.length === 0 || isUploading"
            class="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed font-medium"
          >
            {{ isUploading ? 'Processing...' : 'Start Upload' }}
          </button>
        </div>

        <!-- Step 2: Upload Progress -->
        <div v-if="currentStep === 2" class="space-y-6">
          <h2 class="text-xl font-semibold dark:text-slate-100 mb-4">Uploading Trip...</h2>

          <div class="space-y-2">
            <div class="flex justify-between text-sm text-gray-600 dark:text-slate-300">
              <span>{{ uploadStatus }}</span>
              <span>{{ uploadProgress }}%</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3">
              <div
                class="bg-blue-600 h-3 rounded-full transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              ></div>
            </div>
          </div>

          <div v-if="error" class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">
            <p class="text-red-800 dark:text-red-300">{{ error }}</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { extractExifBatch } from '@/utils/exif'
import { uploadMultipleFiles } from '@/lib/cloudinary'
import { createTrip, createPhotos, updateTripCoverPhoto } from '@/utils/database'
import { generateUniqueSlug } from '@/utils/slug'
import type { PhotoMetadata } from '@/utils/exif'

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

<template>
  <div class="space-y-4">
    <!-- Role Selection -->
    <div class="space-y-2">
      <Label>Role for All Selected Trips</Label>
      <Select :model-value="role" @update:model-value="handleRoleChange">
        <SelectTrigger>
          <SelectValue placeholder="Select role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewer">Viewer - Can view photos</SelectItem>
          <SelectItem value="editor">Editor - Can view and upload photos</SelectItem>
        </SelectContent>
      </Select>
      <p class="text-sm text-muted-foreground">
        This role will apply to all trips you select below.
      </p>
    </div>

    <Separator />

    <!-- Trip Selection -->
    <div class="space-y-2">
      <Label>Select Trips</Label>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="flex flex-col items-center gap-3">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p class="text-sm text-muted-foreground">Loading trips...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMessage" class="py-8 text-center">
        <p class="text-sm text-destructive">{{ errorMessage }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="trips.length === 0" class="py-8 text-center">
        <p class="text-sm text-muted-foreground">No trips available. Create a trip first.</p>
      </div>

      <!-- Trip List -->
      <div v-else class="space-y-2 max-h-64 overflow-y-auto border rounded-md p-4">
        <div v-for="trip in trips" :key="trip.id" class="flex items-center space-x-3 py-2">
          <Checkbox
            :id="`trip-${trip.id}`"
            :model-value="modelValue.includes(trip.id)"
            @update:model-value="() => toggleTrip(trip.id)"
          />
          <label
            :for="`trip-${trip.id}`"
            class="flex-1 text-sm font-medium leading-none cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -ml-2"
          >
            {{ trip.title }}
            <span class="text-muted-foreground ml-2">({{ trip.photo_count }} photos)</span>
          </label>
        </div>
      </div>

      <p class="text-sm text-muted-foreground">
        {{ modelValue.length }} trip{{ modelValue.length !== 1 ? 's' : '' }} selected
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAllTripsAdmin, type TripWithMetadata } from '@/utils/database'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { Role } from '@/lib/invites'

// Props & Emits
interface Props {
  modelValue: string[] // Array of trip IDs
  role: Role
}

interface Emits {
  (e: 'update:modelValue', value: string[]): void
  (e: 'update:role', value: Role): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// State
const trips = ref<TripWithMetadata[]>([])
const loading = ref(true)
const errorMessage = ref<string | null>(null)

// Valid roles for runtime validation
const validRoles: Role[] = ['editor', 'viewer']

// Methods
function handleRoleChange(value: unknown) {
  if (typeof value === 'string' && validRoles.includes(value as Role)) {
    emit('update:role', value as Role)
  } else {
    console.warn('Invalid role received from Select:', value)
  }
}

function toggleTrip(tripId: string) {
  const currentSelection = [...props.modelValue]
  const index = currentSelection.indexOf(tripId)

  if (index > -1) {
    currentSelection.splice(index, 1)
  } else {
    currentSelection.push(tripId)
  }

  emit('update:modelValue', currentSelection)
}

// Lifecycle
onMounted(async () => {
  try {
    trips.value = await getAllTripsAdmin()
  } catch (error) {
    console.error('Failed to fetch trips:', error)
    errorMessage.value = 'Failed to load trips. Please refresh the page.'
  } finally {
    loading.value = false
  }
})
</script>

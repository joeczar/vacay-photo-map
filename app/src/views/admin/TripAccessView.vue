<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">Trip Access Management</h1>
    </div>

    <!-- Trip Selector -->
    <Card class="mb-6">
      <CardContent class="pt-6">
        <!-- Loading State -->
        <div v-if="loadingTrips" class="flex items-center justify-center py-8">
          <div class="flex flex-col items-center gap-3">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p class="text-sm text-muted-foreground">Loading trips...</p>
          </div>
        </div>

        <!-- Trip Selector -->
        <div v-else class="space-y-2">
          <label class="text-sm font-medium">Select Trip *</label>
          <Select
            :model-value="selectedTripId ?? undefined"
            @update:model-value="
              value => handleTripSelect(typeof value === 'string' ? value : undefined)
            "
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a trip to manage access..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="trip in trips" :key="trip.id" :value="trip.id">
                {{ trip.title
                }}{{ trip.date_range ? ` (${formatDate(trip.date_range.start)})` : '' }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>

    <!-- Only show when trip selected -->
    <template v-if="selectedTripId">
      <!-- Card 1: Grant Access Form -->
      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Grant Access to User</CardTitle>
          <CardDescription>Give a user permission to view or edit this trip.</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="handleGrantAccess" class="space-y-4">
            <!-- User Selector -->
            <div class="space-y-2">
              <label class="text-sm font-medium">User *</label>
              <Select v-model="selectedUserId" :disabled="availableUsers.length === 0">
                <SelectTrigger>
                  <SelectValue
                    :placeholder="
                      availableUsers.length === 0 ? 'No users available' : 'Select a user...'
                    "
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="user in availableUsers" :key="user.id" :value="user.id">
                    {{ user.email }}{{ user.displayName ? ` (${user.displayName})` : '' }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-if="availableUsers.length === 0" class="text-sm text-muted-foreground">
                All users already have access or are admins
              </p>
            </div>

            <!-- Role Selector -->
            <div class="space-y-2">
              <label class="text-sm font-medium">Role *</label>
              <Select v-model="selectedRole">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Submit Button -->
            <Button
              type="submit"
              :disabled="!selectedUserId || isGranting || availableUsers.length === 0"
              class="btn-gradient-primary"
            >
              {{ isGranting ? 'Granting Access...' : 'Grant Access' }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <!-- Card 2: Users with Access -->
      <Card>
        <CardHeader>
          <CardTitle>Users with Access</CardTitle>
          <CardDescription>Manage roles and revoke access for users.</CardDescription>
        </CardHeader>
        <CardContent>
          <TripAccessList
            :users="accessUsers"
            :loading="loadingUsers"
            @update-role="handleUpdateRole"
            @revoke="handleRevoke"
          />
        </CardContent>
      </Card>
    </template>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import TripAccessList from '@/components/admin/TripAccessList.vue'
import { useToast } from '@/components/ui/toast/use-toast'
import { getAllTripsAdmin } from '@/utils/database'
import type { TripWithMetadata } from '@/utils/database'
import {
  getAllUsers,
  getTripAccessList,
  grantTripAccess,
  updateTripAccessRole,
  revokeTripAccess
} from '@/lib/trip-access'
import type { Role, TripAccessUser, UserInfo } from '@/lib/trip-access'

// Toast
const { toast } = useToast()

// Trip state
const selectedTripId = ref<string | null>(null)
const trips = ref<TripWithMetadata[]>([])
const loadingTrips = ref(true)

// User state
const allUsers = ref<UserInfo[]>([])
const accessUsers = ref<TripAccessUser[]>([])
const loadingUsers = ref(false)

// Form state
const selectedUserId = ref<string | null>(null)
const selectedRole = ref<Role>('viewer')
const isGranting = ref(false)

// Computed: Users available to grant access (exclude admins and already-granted)
const availableUsers = computed(() => {
  const accessUserIds = new Set(accessUsers.value.map(u => u.userId))
  return allUsers.value.filter(u => !u.isAdmin && !accessUserIds.has(u.id))
})

// Helper: Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Load trips
async function loadTrips() {
  loadingTrips.value = true
  try {
    trips.value = await getAllTripsAdmin()
  } catch (error) {
    console.error('Failed to load trips:', error)
    toast({
      title: 'Error',
      description: 'Failed to load trips',
      variant: 'destructive'
    })
  } finally {
    loadingTrips.value = false
  }
}

// Load all users
async function loadAllUsers() {
  try {
    allUsers.value = await getAllUsers()
  } catch (error) {
    console.error('Failed to load users:', error)
    toast({
      title: 'Error',
      description: 'Failed to load users',
      variant: 'destructive'
    })
  }
}

// Load access users for a trip
async function loadAccessUsers(tripId: string) {
  loadingUsers.value = true
  try {
    accessUsers.value = await getTripAccessList(tripId)
  } catch (error) {
    console.error('Failed to load access users:', error)
    toast({
      title: 'Error',
      description: 'Failed to load users with access',
      variant: 'destructive'
    })
  } finally {
    loadingUsers.value = false
  }
}

// Handle trip selection
async function handleTripSelect(tripId: string | undefined) {
  if (!tripId) {
    selectedTripId.value = null
    accessUsers.value = []
    return
  }

  selectedTripId.value = tripId
  selectedUserId.value = null // Reset user selection
  await loadAccessUsers(tripId)
}

// Grant access to a user
async function handleGrantAccess() {
  if (!selectedUserId.value || !selectedTripId.value) return

  isGranting.value = true
  try {
    await grantTripAccess(selectedUserId.value, selectedTripId.value, selectedRole.value)

    // Find the user's email for the toast
    const user = allUsers.value.find(u => u.id === selectedUserId.value)
    const userEmail = user?.email ?? 'User'

    toast({
      title: 'Access Granted',
      description: `Access granted to ${userEmail}`
    })

    // Reset form
    selectedUserId.value = null
    selectedRole.value = 'viewer'

    // Refresh access list
    await loadAccessUsers(selectedTripId.value)
  } catch (error) {
    console.error('Failed to grant access:', error)
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to grant access',
      variant: 'destructive'
    })
  } finally {
    isGranting.value = false
  }
}

// Update role (simple version for now - dialog in Commit 4)
async function handleUpdateRole(payload: {
  accessId: string
  currentRole: Role
  user: TripAccessUser
}) {
  try {
    // Determine the new role (toggle between editor and viewer)
    const newRole: Role = payload.currentRole === 'editor' ? 'viewer' : 'editor'

    await updateTripAccessRole(payload.accessId, newRole)

    toast({
      title: 'Role Updated',
      description: `Role updated to ${newRole}`
    })

    // Refresh access list
    if (selectedTripId.value) {
      await loadAccessUsers(selectedTripId.value)
    }
  } catch (error) {
    console.error('Failed to update role:', error)
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to update role',
      variant: 'destructive'
    })
  }
}

// Revoke access (simple version for now - dialog in Commit 4)
async function handleRevoke(payload: { accessId: string; user: TripAccessUser }) {
  try {
    await revokeTripAccess(payload.accessId)

    toast({
      title: 'Access Revoked',
      description: `Access revoked for ${payload.user.email}`
    })

    // Refresh access list
    if (selectedTripId.value) {
      await loadAccessUsers(selectedTripId.value)
    }
  } catch (error) {
    console.error('Failed to revoke access:', error)
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to revoke access',
      variant: 'destructive'
    })
  }
}

// Load trips and users on mount
onMounted(async () => {
  await loadTrips()
  await loadAllUsers()
})
</script>

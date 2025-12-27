<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">User Management</h1>
    </div>

    <!-- Card: Registered Users -->
    <Card>
      <CardHeader>
        <CardTitle>Registered Users</CardTitle>
        <CardDescription>All users registered in the system.</CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <p class="text-muted-foreground">Loading users...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="users.length === 0" class="text-center py-12">
          <p class="text-muted-foreground">No registered users yet.</p>
        </div>

        <!-- User Table -->
        <div v-else class="border rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full" role="table" aria-label="Registered users list">
              <thead class="bg-muted/50 border-b">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium">Email</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">Display Name</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">Role</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">Trip Access</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="user in users" :key="user.id">
                  <!-- User Row (clickable, keyboard accessible) -->
                  <tr
                    class="border-b last:border-0 hover:bg-muted/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                    tabindex="0"
                    role="button"
                    :aria-expanded="expandedUsers.has(user.id)"
                    :aria-label="`${user.email}, click to ${expandedUsers.has(user.id) ? 'collapse' : 'expand'} trip access details`"
                    @click="toggleUserExpanded(user.id)"
                    @keydown.enter="toggleUserExpanded(user.id)"
                    @keydown.space.prevent="toggleUserExpanded(user.id)"
                  >
                    <!-- Email -->
                    <td class="px-4 py-3 text-sm">
                      {{ user.email }}
                    </td>

                    <!-- Display Name -->
                    <td class="px-4 py-3 text-sm">
                      {{ user.displayName || '-' }}
                    </td>

                    <!-- Role Badge -->
                    <td class="px-4 py-3">
                      <Badge v-if="user.isAdmin" variant="default">Admin</Badge>
                      <Badge v-else variant="secondary">User</Badge>
                    </td>

                    <!-- Trip Access Count with Chevron -->
                    <td class="px-4 py-3 text-sm">
                      <div class="flex items-center gap-2">
                        <span v-if="userTripAccess.has(user.id)">
                          {{ userTripAccess.get(user.id)?.length || 0 }} trips
                        </span>
                        <span v-else class="text-muted-foreground">-</span>
                        <!-- Chevron indicator -->
                        <ChevronDown
                          :class="[
                            'h-4 w-4 transition-transform',
                            { 'rotate-180': expandedUsers.has(user.id) }
                          ]"
                        />
                      </div>
                    </td>
                  </tr>

                  <!-- Expanded Details Row -->
                  <tr v-if="expandedUsers.has(user.id)" class="border-b last:border-0">
                    <td colspan="4" class="bg-muted/20 px-4 py-3">
                      <!-- Loading State -->
                      <div
                        v-if="loadingTripAccess.has(user.id)"
                        class="text-sm text-muted-foreground"
                      >
                        Loading trip access...
                      </div>

                      <!-- No Access -->
                      <div
                        v-else-if="!userTripAccess.get(user.id)?.length"
                        class="text-sm text-muted-foreground"
                      >
                        No trip access
                      </div>

                      <!-- Trip Access List -->
                      <div v-else class="space-y-2">
                        <div
                          v-for="access in userTripAccess.get(user.id)"
                          :key="access.tripId"
                          class="flex items-center justify-between text-sm"
                        >
                          <span>{{ access.tripTitle }}</span>
                          <div class="flex items-center gap-2">
                            <Badge :variant="access.role === 'editor' ? 'default' : 'secondary'">
                              {{ access.role }}
                            </Badge>
                            <span class="text-muted-foreground text-xs">
                              {{ formatDate(access.grantedAt) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast/use-toast'
import { getAllUsers, getTripAccessList } from '@/lib/trip-access'
import type { UserInfo, Role } from '@/lib/trip-access'
import { getAllTripsAdmin } from '@/utils/database'
import { ChevronDown } from 'lucide-vue-next'

// Toast
const { toast } = useToast()

// State
const users = ref<UserInfo[]>([])
const loading = ref(true)

// Expandable rows state
const expandedUsers = ref<Set<string>>(new Set())
const userTripAccess = ref<Map<string, TripAccessInfo[]>>(new Map())
const loadingTripAccess = ref<Set<string>>(new Set())

interface TripAccessInfo {
  tripId: string
  tripTitle: string
  role: Role
  grantedAt: string
}

// Load all users
async function loadUsers() {
  loading.value = true
  try {
    users.value = await getAllUsers()
  } catch (error) {
    console.error('Failed to load users:', error)
    toast({
      title: 'Error',
      description: 'Failed to load users',
      variant: 'destructive'
    })
  } finally {
    loading.value = false
  }
}

// Toggle user expansion
function toggleUserExpanded(userId: string) {
  if (expandedUsers.value.has(userId)) {
    expandedUsers.value.delete(userId)
  } else {
    expandedUsers.value.add(userId)
    // Load trip access if not already loaded and not currently loading (prevents race condition)
    if (!userTripAccess.value.has(userId) && !loadingTripAccess.value.has(userId)) {
      loadUserTripAccess(userId)
    }
  }
  // Force reactivity
  expandedUsers.value = new Set(expandedUsers.value)
}

// Load trip access for a specific user
async function loadUserTripAccess(userId: string) {
  loadingTripAccess.value.add(userId)
  loadingTripAccess.value = new Set(loadingTripAccess.value)

  try {
    // Get all trips first
    const trips = await getAllTripsAdmin()

    // Fetch all trip access lists in parallel (fixes N+1 query pattern)
    const tripAccessResults = await Promise.all(
      trips.map(async trip => {
        const tripUsers = await getTripAccessList(trip.id)
        const userAccess = tripUsers.find(u => u.userId === userId)
        if (userAccess) {
          return {
            tripId: trip.id,
            tripTitle: trip.title,
            role: userAccess.role,
            grantedAt: userAccess.grantedAt
          }
        }
        return null
      })
    )

    // Filter out nulls
    const accessList = tripAccessResults.filter(
      (access): access is TripAccessInfo => access !== null
    )

    userTripAccess.value.set(userId, accessList)
    userTripAccess.value = new Map(userTripAccess.value)
  } catch (error) {
    console.error('Failed to load trip access:', error)
    toast({
      title: 'Error',
      description: 'Failed to load trip access details',
      variant: 'destructive'
    })
  } finally {
    loadingTripAccess.value.delete(userId)
    loadingTripAccess.value = new Set(loadingTripAccess.value)
  }
}

// Format date helper with validation
function formatDate(dateString: string): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Load on mount
onMounted(() => {
  loadUsers()
})
</script>

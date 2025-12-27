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
                <tr
                  v-for="user in users"
                  :key="user.id"
                  class="border-b last:border-0 hover:bg-muted/30"
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

                  <!-- Trip Access Count (placeholder for now) -->
                  <td class="px-4 py-3 text-sm text-muted-foreground">-</td>
                </tr>
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
import { getAllUsers } from '@/lib/trip-access'
import type { UserInfo } from '@/lib/trip-access'

// Toast
const { toast } = useToast()

// State
const users = ref<UserInfo[]>([])
const loading = ref(true)

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

// Load on mount
onMounted(() => {
  loadUsers()
})
</script>

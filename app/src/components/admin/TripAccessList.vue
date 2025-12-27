<template>
  <div class="space-y-4">
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading users...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="users.length === 0" class="text-center py-12">
      <p class="text-muted-foreground">No users have access to this trip yet.</p>
    </div>

    <!-- User Table -->
    <div v-else class="border rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full" role="table" aria-label="Trip access list">
          <thead class="bg-muted/50 border-b">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium">Email</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Display Name</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Role</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Granted At</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
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
                <Badge :variant="getRoleVariant(user.role)">
                  {{ capitalizeRole(user.role) }}
                </Badge>
              </td>

              <!-- Granted At -->
              <td class="px-4 py-3 text-sm text-muted-foreground">
                {{ formatDate(user.grantedAt) }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <Select
                    :model-value="user.role"
                    @update:model-value="value => handleRoleChange(user, value)"
                  >
                    <SelectTrigger class="w-[140px]" :aria-label="`Change role for ${user.email}`">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    :aria-label="`Revoke access for ${user.email}`"
                    @click="handleRevoke(user)"
                  >
                    Revoke
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { TripAccessUser, Role } from '@/lib/trip-access'

// Props & Emits
interface Props {
  users: TripAccessUser[]
  loading: boolean
}

interface Emits {
  (e: 'update-role', payload: { accessId: string; currentRole: Role; user: TripAccessUser }): void
  (e: 'revoke', payload: { accessId: string; user: TripAccessUser }): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

// Helper: Get badge variant based on role
function getRoleVariant(role: Role): 'default' | 'secondary' {
  return role === 'editor' ? 'default' : 'secondary'
}

// Helper: Capitalize role
function capitalizeRole(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

// Helper: Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Handler: Role change
function handleRoleChange(user: TripAccessUser, value: unknown): void {
  // Validate the value is a valid Role
  if (typeof value === 'string' && (value === 'editor' || value === 'viewer')) {
    const newRole = value as Role
    // Only emit if role actually changed
    if (newRole !== user.role) {
      emit('update-role', {
        accessId: user.id,
        currentRole: user.role,
        user
      })
    }
  } else {
    console.warn('Invalid role received from Select:', value)
  }
}

// Handler: Revoke access
function handleRevoke(user: TripAccessUser): void {
  emit('revoke', {
    accessId: user.id,
    user
  })
}
</script>

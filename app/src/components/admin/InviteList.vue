<template>
  <div class="space-y-4">
    <!-- Empty State -->
    <div v-if="invites.length === 0" class="text-center py-12">
      <p class="text-muted-foreground">No invites yet. Create your first invite above.</p>
    </div>

    <!-- Invite Table -->
    <div v-else class="border rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-muted/50 border-b">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium">Email</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Role</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Trips</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Expires</th>
              <th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invite in invites"
              :key="invite.id"
              class="border-b last:border-0 hover:bg-muted/30"
            >
              <!-- Email -->
              <td class="px-4 py-3 text-sm">
                {{ invite.email || 'No email' }}
              </td>

              <!-- Role -->
              <td class="px-4 py-3 text-sm">
                <span class="capitalize">{{ invite.role }}</span>
              </td>

              <!-- Trip Count -->
              <td class="px-4 py-3 text-sm">
                {{ invite.tripCount }} trip{{ invite.tripCount !== 1 ? 's' : '' }}
              </td>

              <!-- Status Badge -->
              <td class="px-4 py-3">
                <Badge :variant="getStatusVariant(invite.status)">
                  {{ invite.status }}
                </Badge>
              </td>

              <!-- Expiration -->
              <td class="px-4 py-3 text-sm text-muted-foreground">
                {{ formatExpiration(invite.expiresAt, invite.status) }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3">
                <div v-if="invite.status === 'pending'" class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="$emit('copy', invite.code)"
                    title="Copy invite link"
                  >
                    Copy Link
                  </Button>
                  <Button variant="outline" size="sm" @click="$emit('revoke', invite.id)">
                    Revoke
                  </Button>
                </div>
                <span v-else class="text-sm text-muted-foreground">-</span>
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
import type { InviteListItem, InviteStatus } from '@/lib/invites'

// Props & Emits
interface Props {
  invites: InviteListItem[]
}

interface Emits {
  (e: 'revoke', inviteId: string): void
  (e: 'copy', code: string): void
}

defineProps<Props>()
defineEmits<Emits>()

// Helper: Get badge variant based on status
function getStatusVariant(status: InviteStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'pending':
      return 'default' // Primary blue
    case 'used':
      return 'secondary' // Muted green
    case 'expired':
      return 'outline' // Gray
    default:
      return 'outline'
  }
}

// Helper: Format expiration date
function formatExpiration(expiresAt: string, status: InviteStatus): string {
  if (status === 'used') return 'N/A'
  if (status === 'expired') return 'Expired'

  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 0) return 'Expired'

  return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
}
</script>

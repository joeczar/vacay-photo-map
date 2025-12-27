<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">Invites</h1>
    </div>

    <!-- Create Invite Form -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle>Create New Invite</CardTitle>
        <CardDescription> Invite a user and grant them access to selected trips. </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="onSubmit" class="space-y-6">
          <!-- Email Input -->
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>Email Address *</FormLabel>
              <FormControl>
                <Input type="email" placeholder="user@example.com" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <!-- Trip Selector Component -->
          <TripSelector v-model="selectedTripIds" v-model:role="selectedRole" />

          <!-- Validation message for trips -->
          <p v-if="showTripError" class="text-sm text-destructive">
            Please select at least one trip
          </p>

          <!-- Submit Button -->
          <div class="flex gap-3">
            <Button
              type="submit"
              :disabled="!meta.valid || selectedTripIds.length === 0 || isSubmitting"
              class="btn-gradient-primary"
            >
              {{ isSubmitting ? 'Creating...' : 'Create Invite' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Invite List -->
    <Card>
      <CardHeader>
        <CardTitle>Manage Invites</CardTitle>
        <CardDescription> View and manage invitation links. </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="loadingInvites" class="flex items-center justify-center py-8">
          <div class="flex flex-col items-center gap-3">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p class="text-sm text-muted-foreground">Loading invites...</p>
          </div>
        </div>

        <!-- Invite List Component -->
        <InviteList v-else :invites="invites" @revoke="handleRevoke" @copy="handleCopyLink" />
      </CardContent>
    </Card>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { useToast } from '@/components/ui/toast/use-toast'
import { createInvite, getAllInvites, revokeInvite } from '@/lib/invites'
import type { InviteListItem, Role } from '@/lib/invites'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import TripSelector from '@/components/admin/TripSelector.vue'
import InviteList from '@/components/admin/InviteList.vue'

// Toast
const { toast } = useToast()

// Form validation schema
const formSchema = toTypedSchema(
  z.object({
    email: z.string().min(1, 'Email is required').email('Must be a valid email address')
  })
)

const {
  handleSubmit,
  resetForm: resetVeeForm,
  meta
} = useForm({
  validationSchema: formSchema,
  initialValues: {
    email: ''
  }
})

// Form state
const selectedTripIds = ref<string[]>([])
const selectedRole = ref<Role>('viewer')
const isSubmitting = ref(false)
const showTripError = ref(false)

// Invite list state
const invites = ref<InviteListItem[]>([])
const loadingInvites = ref(true)

// Get app URL from env
const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173'

// Submit handler
const onSubmit = handleSubmit(async values => {
  if (selectedTripIds.value.length === 0) {
    showTripError.value = true
    return
  }
  showTripError.value = false

  isSubmitting.value = true

  try {
    const response = await createInvite(values.email, selectedRole.value, selectedTripIds.value)

    // Generate invite link
    const inviteLink = `${APP_URL}/register?invite=${response.invite.code}`

    // Copy to clipboard
    await navigator.clipboard.writeText(inviteLink)

    // Show success toast
    toast({
      title: 'Invite Created',
      description: `Invite link copied to clipboard! Valid for 7 days.`
    })

    // Reset form
    resetVeeForm()
    selectedTripIds.value = []
    selectedRole.value = 'viewer'

    // Refresh invite list
    await fetchInvites()
  } catch (error) {
    console.error('Failed to create invite:', error)
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to create invite',
      variant: 'destructive'
    })
  } finally {
    isSubmitting.value = false
  }
})

// Fetch invites
async function fetchInvites() {
  loadingInvites.value = true
  try {
    invites.value = await getAllInvites()
  } catch (error) {
    console.error('Failed to fetch invites:', error)
    toast({
      title: 'Error',
      description: 'Failed to load invites',
      variant: 'destructive'
    })
  } finally {
    loadingInvites.value = false
  }
}

// Copy invite link
async function handleCopyLink(code: string) {
  try {
    const inviteLink = `${APP_URL}/register?invite=${code}`
    await navigator.clipboard.writeText(inviteLink)

    toast({
      title: 'Link Copied',
      description: 'Invite link copied to clipboard'
    })
  } catch (error) {
    console.error('Failed to copy link:', error)
    toast({
      title: 'Error',
      description: 'Failed to copy link to clipboard',
      variant: 'destructive'
    })
  }
}

// Revoke invite handler (simple version for now - dialog added in Commit 5)
async function handleRevoke(inviteId: string) {
  try {
    await revokeInvite(inviteId)

    toast({
      title: 'Invite Revoked',
      description: 'The invite has been revoked and can no longer be used.'
    })

    // Refresh list
    await fetchInvites()
  } catch (error) {
    console.error('Failed to revoke invite:', error)
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to revoke invite',
      variant: 'destructive'
    })
  }
}

// Load invites on mount
onMounted(() => {
  fetchInvites()
})
</script>

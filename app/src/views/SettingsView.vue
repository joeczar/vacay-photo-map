<template>
  <MainLayout>
    <div class="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>

        <CardContent>
          <!-- Success alert -->
          <Alert v-if="successMessage" class="mb-4">
            <AlertDescription>{{ successMessage }}</AlertDescription>
          </Alert>

          <!-- Error alert -->
          <Alert v-if="error" variant="destructive" class="mb-4">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>

          <form @submit="onSubmit" class="space-y-4">
            <FormField v-slot="{ componentField }" name="currentPassword">
              <FormItem>
                <FormLabel>Current Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter your current password"
                    v-bind="componentField"
                    :disabled="isSubmitting"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="newPassword">
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter your new password"
                    v-bind="componentField"
                    :disabled="isSubmitting"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="confirmPassword">
              <FormItem>
                <FormLabel>Confirm New Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Confirm your new password"
                    v-bind="componentField"
                    :disabled="isSubmitting"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <Button type="submit" class="w-full" :disabled="isSubmitting || !meta.valid">
              {{ isSubmitting ? 'Updating...' : 'Update Password' }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import MainLayout from '@/layouts/MainLayout.vue'

// State
const isSubmitting = ref(false)
const error = ref('')
const successMessage = ref('')

// Form validation schema
const passwordSchema = toTypedSchema(
  z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().min(1, 'Please confirm your new password')
    })
    .refine(data => data.newPassword !== data.currentPassword, {
      message: 'New password must be different from current password',
      path: ['newPassword']
    })
    .refine(data => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword']
    })
)

const { handleSubmit, meta, resetForm } = useForm({
  validationSchema: passwordSchema,
  initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
})

// Form submission handler
const onSubmit = handleSubmit(async values => {
  isSubmitting.value = true
  error.value = ''
  successMessage.value = ''

  try {
    await api.post('/api/auth/change-password', {
      currentPassword: values.currentPassword,
      newPassword: values.newPassword
    })

    successMessage.value = 'Password updated successfully'
    resetForm()
  } catch (err) {
    console.error('[SETTINGS] Password change failed:', err)

    if (err instanceof ApiError) {
      if (err.status === 401) {
        error.value = 'Current password is incorrect'
      } else {
        error.value = err.message || 'Failed to update password. Please try again.'
      }
    } else {
      error.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isSubmitting.value = false
  }
})
</script>

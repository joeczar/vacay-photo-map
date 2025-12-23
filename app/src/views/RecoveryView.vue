<template>
  <AuthLayout>
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl">Account Recovery</CardTitle>
        <CardDescription>
          {{
            step === 'email'
              ? 'Enter the email associated with your account'
              : 'Check your Telegram for the 6-digit code'
          }}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <!-- Error alert -->
        <Alert v-if="error" variant="destructive" class="mb-4">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <!-- Success alert (after email sent) -->
        <Alert v-if="step === 'code' && !error" class="mb-4">
          <AlertDescription>
            Recovery code sent to your Telegram. Enter it below.
          </AlertDescription>
        </Alert>

        <!-- Step 1: Email form -->
        <form v-if="step === 'email'" @submit="onSubmitEmail" class="space-y-4">
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  v-bind="componentField"
                  :disabled="isSubmitting"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <Button type="submit" class="w-full" :disabled="isSubmitting || !emailMeta.valid">
            {{ isSubmitting ? 'Sending...' : 'Send Recovery Code' }}
          </Button>
        </form>

        <!-- Step 2: Code verification form -->
        <form v-if="step === 'code'" @submit="onSubmitCode" class="space-y-4">
          <FormField v-slot="{ componentField }" name="code">
            <FormItem>
              <FormLabel>Recovery Code</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="123456"
                  v-bind="componentField"
                  :disabled="isSubmitting"
                  maxlength="6"
                  pattern="[0-9]{6}"
                  inputmode="numeric"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <Button type="submit" class="w-full" :disabled="isSubmitting || !codeMeta.valid">
            {{ isSubmitting ? 'Verifying...' : 'Verify Code' }}
          </Button>

          <!-- Back button -->
          <Button
            type="button"
            variant="outline"
            class="w-full"
            :disabled="isSubmitting"
            @click="backToEmail"
          >
            Back to Email
          </Button>
        </form>

        <!-- Link to login -->
        <div class="mt-4 text-center text-sm text-muted-foreground">
          Remember your passkey?
          <router-link to="/login" class="text-primary hover:underline"> Login </router-link>
        </div>
      </CardContent>
    </Card>
  </AuthLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import AuthLayout from '@/layouts/AuthLayout.vue'

const router = useRouter()

// State
const step = ref<'email' | 'code'>('email')
const email = ref('')
const isSubmitting = ref(false)
const error = ref('')

// Email form validation schema
const emailSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address')
  })
)

// Code form validation schema
const codeSchema = toTypedSchema(
  z.object({
    code: z
      .string()
      .length(6, 'Code must be exactly 6 digits')
      .regex(/^\d+$/, 'Code must contain only numbers')
  })
)

// Email form
const { handleSubmit: handleSubmitEmail, meta: emailMeta } = useForm({
  validationSchema: emailSchema,
  initialValues: { email: '' }
})

// Code form
const { handleSubmit: handleSubmitCode, meta: codeMeta } = useForm({
  validationSchema: codeSchema,
  initialValues: { code: '' }
})

// Email form submission handler
const onSubmitEmail = handleSubmitEmail(async values => {
  isSubmitting.value = true
  error.value = ''

  try {
    await api.post('/api/auth/recovery/request', { email: values.email })

    // Store email for verify step
    email.value = values.email

    // Move to code step
    step.value = 'code'
  } catch (err) {
    console.error('[RECOVERY] Request failed:', err)

    if (err instanceof ApiError) {
      if (err.status === 429) {
        error.value = 'Too many requests. Please try again later.'
      } else {
        error.value = err.message || 'Failed to send recovery code. Please try again.'
      }
    } else {
      error.value = 'Connection failed. Please check your internet and try again.'
    }
  } finally {
    isSubmitting.value = false
  }
})

// Code form submission handler
const onSubmitCode = handleSubmitCode(async values => {
  isSubmitting.value = true
  error.value = ''

  try {
    // Verify the code
    await api.post('/api/auth/recovery/verify', {
      email: email.value,
      code: values.code
    })

    // Success - redirect to register to set up new passkey
    await router.push('/register')
  } catch (err) {
    console.error('[RECOVERY] Verify failed:', err)

    if (err instanceof ApiError) {
      if (err.status === 400) {
        error.value = 'Invalid or expired code. Codes expire after 10 minutes.'
      } else if (err.status === 429) {
        error.value = 'Too many attempts. Please request a new code.'
      } else {
        error.value = err.message || 'Failed to verify code. Please try again.'
      }
    } else {
      error.value = 'Connection failed. Please check your internet and try again.'
    }
  } finally {
    isSubmitting.value = false
  }
})

// Back to email step
const backToEmail = () => {
  step.value = 'email'
  error.value = ''
}
</script>

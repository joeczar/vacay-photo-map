<template>
  <AuthLayout>
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl">Create Account</CardTitle>
        <CardDescription>Register a new passkey</CardDescription>
      </CardHeader>

      <CardContent>
        <!-- WebAuthn not supported warning -->
        <Alert v-if="!webAuthnSupported" variant="destructive" class="mb-4">
          <AlertDescription>{{ webAuthnMessage }}</AlertDescription>
        </Alert>

        <!-- Error alert -->
        <Alert v-if="error" variant="destructive" class="mb-4">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <!-- Invite validation loading -->
        <Alert v-if="inviteStatus === 'loading'" variant="default" class="mb-4">
          <AlertDescription>Validating invite...</AlertDescription>
        </Alert>

        <!-- Invite valid - show details -->
        <Alert v-if="inviteStatus === 'valid' && inviteData?.invite" variant="default" class="mb-4">
          <AlertDescription>
            <p class="font-medium">Invite valid for {{ inviteData.invite.email }}</p>
            <div v-if="inviteData.trips && inviteData.trips.length > 0" class="mt-3">
              <p class="text-sm font-medium mb-2">You'll get access to:</p>
              <div class="space-y-1">
                <div
                  v-for="trip in inviteData.trips"
                  :key="trip.id"
                  class="flex items-center justify-between text-sm"
                >
                  <span>{{ trip.title }}</span>
                  <RoleBadge :role="inviteData.invite.role" />
                </div>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        <!-- Invite invalid -->
        <Alert v-if="inviteStatus === 'invalid'" variant="destructive" class="mb-4">
          <AlertDescription>{{ inviteError }}</AlertDescription>
        </Alert>

        <form @submit="onSubmit" class="space-y-4">
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  v-bind="componentField"
                  :disabled="isRegistering || !webAuthnSupported"
                  :readonly="inviteStatus === 'valid'"
                  class="read-only:bg-muted read-only:cursor-not-allowed"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="displayName">
            <FormItem>
              <FormLabel>Display Name (optional)</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Your name"
                  v-bind="componentField"
                  :disabled="isRegistering || !webAuthnSupported"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <Button
            type="submit"
            class="w-full"
            :disabled="isRegistering || !meta.valid || !webAuthnSupported"
          >
            {{ isRegistering ? 'Creating account...' : 'Register with Passkey' }}
          </Button>
        </form>

        <div class="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?
          <router-link to="/login" class="text-primary hover:underline"> Login </router-link>
        </div>
      </CardContent>
    </Card>
  </AuthLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { startRegistration } from '@simplewebauthn/browser'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON
} from '@simplewebauthn/types'
import { useAuth, type User } from '@/composables/useAuth'
import { api, ApiError } from '@/lib/api'
import { validateInvite, type ValidateInviteResponse } from '@/lib/invites'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import AuthLayout from '@/layouts/AuthLayout.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import { checkWebAuthnSupport } from '@/utils/webauthn'

const router = useRouter()
const route = useRoute()
const { isAuthenticated, setAuthState } = useAuth()

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}

// State
const isRegistering = ref(false)
const error = ref('')
const inviteStatus = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const inviteData = ref<ValidateInviteResponse | null>(null)
const inviteError = ref('')

// Check WebAuthn support
const { supported: webAuthnSupported, message: webAuthnMessage } = checkWebAuthnSupport()

// Check registration status on mount
onMounted(async () => {
  try {
    // Pass invite code to registration-status check if present
    const inviteCode = route.query.invite as string | undefined

    // Validate invite if present
    if (inviteCode) {
      inviteStatus.value = 'loading'
      try {
        const response = await validateInvite(inviteCode)

        if (response.valid && response.invite) {
          inviteStatus.value = 'valid'
          inviteData.value = response
          // Pre-fill email from invite
          setFieldValue('email', response.invite.email)
        } else {
          inviteStatus.value = 'invalid'
          inviteError.value = response.message || 'Invalid or expired invite'
        }
      } catch (err) {
        inviteStatus.value = 'invalid'
        if (err instanceof ApiError) {
          inviteError.value = err.message || 'Failed to validate invite'
        } else {
          inviteError.value = 'Failed to validate invite'
        }
        console.error('[REGISTER] Failed to validate invite:', err)
      }
    }

    const url = new URL(`${import.meta.env.VITE_API_URL}/api/auth/registration-status`)
    if (inviteCode) {
      url.searchParams.set('invite', inviteCode)
    }

    const response = await fetch(url.toString())

    if (response.ok) {
      const { registrationOpen } = await response.json()

      if (!registrationOpen) {
        error.value = 'Registration is closed. The first user has already been registered.'

        // Redirect to login after showing error briefly
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      }
    }
    // If API call fails, let user try - backend will validate
  } catch (err) {
    // Network error - let user try to register
    // Backend will return 409 if user exists
    console.error('[REGISTER] Failed to fetch registration status:', err)
  }
})

// Form validation schema
const registerSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address'),
    displayName: z
      .string()
      .min(2, 'Display name must be at least 2 characters')
      .optional()
      .or(z.literal(''))
  })
)

const { handleSubmit, meta, setFieldValue } = useForm({
  validationSchema: registerSchema,
  initialValues: { email: '', displayName: '' }
})

// Form submission handler
const onSubmit = handleSubmit(async values => {
  isRegistering.value = true
  error.value = ''

  try {
    // Extract invite code from URL query params (if present)
    // Handle case where query param appears multiple times (string[])
    const inviteCode = Array.isArray(route.query.invite)
      ? route.query.invite[0]
      : route.query.invite

    // Step 1: Get registration options from backend
    const { options } = await api.post<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/register/options',
      {
        email: values.email,
        inviteCode
      }
    )

    // Step 2: Create passkey credential (browser prompts user)
    const credential: RegistrationResponseJSON = await startRegistration({ optionsJSON: options })

    // Step 3: Verify and create user with backend
    const { token, user } = await api.post<{ token: string; user: User }>(
      '/api/auth/register/verify',
      {
        email: values.email,
        displayName: values.displayName || null,
        credential
      }
    )

    // Step 4: Set auth state and redirect
    setAuthState(token, user)
    await router.push('/trips')
  } catch (err) {
    console.error('Registration failed:', err)

    if (err instanceof ApiError) {
      if (err.status === 409) {
        error.value = 'An account with this email already exists. Please login instead.'
      } else if (err.status === 400) {
        error.value = 'Registration failed. Please check your information and try again.'
      } else {
        error.value = err.message || 'Registration failed. Please try again.'
      }
    } else if (err instanceof Error && err.name === 'NotAllowedError') {
      error.value = 'Passkey creation was cancelled. Please try again.'
    } else if (err instanceof Error && err.name === 'InvalidStateError') {
      error.value = 'This passkey is already registered. Please try a different authenticator.'
    } else {
      error.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isRegistering.value = false
  }
})
</script>

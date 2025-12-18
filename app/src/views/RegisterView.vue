<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="border-b border-border bg-card">
      <div class="max-w-7xl mx-auto flex h-16 items-center justify-between px-4">
        <router-link
          to="/"
          class="text-xl font-bold text-foreground hover:text-primary transition-colors"
        >
          Vacay Photo Map
        </router-link>
        <nav class="flex items-center gap-4">
          <Button variant="ghost" as-child>
            <router-link to="/">Home</router-link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
    <main class="flex-1 flex items-center justify-center p-4">
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { checkWebAuthnSupport } from '@/utils/webauthn'

const router = useRouter()
const { isAuthenticated, setAuthState } = useAuth()

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}

// State
const isRegistering = ref(false)
const error = ref('')

// Check WebAuthn support
const { supported: webAuthnSupported, message: webAuthnMessage } = checkWebAuthnSupport()

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

const { handleSubmit, meta } = useForm({
  validationSchema: registerSchema,
  initialValues: { email: '', displayName: '' }
})

// Form submission handler
const onSubmit = handleSubmit(async values => {
  isRegistering.value = true
  error.value = ''

  try {
    // Step 1: Get registration options from backend
    const { options } = await api.post<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/register/options',
      { email: values.email }
    )

    // Step 2: Create passkey credential (browser prompts user)
    const credential: RegistrationResponseJSON = await startRegistration(options)

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
    await router.push('/admin')
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

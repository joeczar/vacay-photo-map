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
          <CardTitle class="text-2xl">Admin Login</CardTitle>
          <CardDescription>Sign in with your passkey</CardDescription>
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
                    :disabled="isLoggingIn || !webAuthnSupported"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <Button
              type="submit"
              class="w-full"
              :disabled="isLoggingIn || !meta.valid || !webAuthnSupported"
            >
              {{ isLoggingIn ? 'Authenticating...' : 'Login with Passkey' }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <!-- Registration form (dev only) -->
      <Card v-if="isDev" class="w-full max-w-md mt-6">
        <CardHeader class="text-center">
          <CardTitle class="text-2xl">Create Account</CardTitle>
          <CardDescription>Register a new passkey</CardDescription>
        </CardHeader>

        <CardContent>
          <Alert class="mb-4">
            <AlertDescription>
              Registration is only available in development mode.
            </AlertDescription>
          </Alert>

          <!-- Error alert -->
          <Alert v-if="registerError" variant="destructive" class="mb-4">
            <AlertDescription>{{ registerError }}</AlertDescription>
          </Alert>

          <form @submit="onRegister" class="space-y-4">
            <FormField v-slot="{ componentField }" name="email" :form="registerForm">
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

            <FormField v-slot="{ componentField }" name="displayName" :form="registerForm">
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
              :disabled="isRegistering || !registerForm.meta.value.valid || !webAuthnSupported"
            >
              {{ isRegistering ? 'Creating account...' : 'Register with Passkey' }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useAuth } from '@/composables/useAuth'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { checkWebAuthnSupport } from '@/utils/webauthn'

const router = useRouter()
const route = useRoute()
const { isAuthenticated, setAuthState } = useAuth()

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}

// State
const isLoggingIn = ref(false)
const error = ref('')
const isRegistering = ref(false)
const registerError = ref('')

// Check WebAuthn support
const { supported: webAuthnSupported, message: webAuthnMessage } = checkWebAuthnSupport()

// Check if in dev mode
const isDev = computed(() => import.meta.env.DEV)

// Form validation schema
const loginSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address')
  })
)

const { handleSubmit, meta } = useForm({
  validationSchema: loginSchema,
  initialValues: { email: '' }
})

// Registration validation schema
const registerSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address'),
    displayName: z.string().min(2, 'Display name must be at least 2 characters').optional().or(z.literal(''))
  })
)

const registerForm = useForm({
  validationSchema: registerSchema,
  initialValues: { email: '', displayName: '' }
})

// Form submission handler
const onSubmit = handleSubmit(async (values) => {
  isLoggingIn.value = true
  error.value = ''

  try {
    // Step 1: Get authentication options from backend
    const options = await api.post<any>('/api/auth/login/options', {
      email: values.email
    })

    // Step 2: Authenticate with passkey (browser prompts user)
    const credential = await startAuthentication(options)

    // Step 3: Verify credential with backend
    const { token, user } = await api.post<{ token: string; user: any }>(
      '/api/auth/login/verify',
      { email: values.email, credential }
    )

    // Step 4: Set auth state and redirect
    setAuthState(token, user)

    const redirectPath = (route.query.redirect as string) || '/admin'
    await router.push(redirectPath)
  } catch (err) {
    console.error('Login failed:', err)

    if (err instanceof ApiError) {
      if (err.status === 404) {
        error.value = 'No account found with this email. Please register first.'
      } else if (err.status === 400) {
        error.value = 'Authentication failed. Please try again.'
      } else {
        error.value = err.message || 'Login failed. Please try again.'
      }
    } else if (err instanceof Error && err.name === 'NotAllowedError') {
      error.value = 'Authentication was cancelled. Please try again.'
    } else {
      error.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isLoggingIn.value = false
  }
})

// Registration submission handler
const onRegister = registerForm.handleSubmit(async (values) => {
  isRegistering.value = true
  registerError.value = ''

  try {
    // Step 1: Get registration options from backend
    const options = await api.post<any>('/api/auth/register/options', {
      email: values.email
    })

    // Step 2: Create passkey credential (browser prompts user)
    const credential = await startRegistration(options)

    // Step 3: Verify and create user with backend
    const { token, user } = await api.post<{ token: string; user: any }>(
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
        registerError.value = 'An account with this email already exists. Please login instead.'
      } else if (err.status === 400) {
        registerError.value = 'Registration failed. Please check your information and try again.'
      } else {
        registerError.value = err.message || 'Registration failed. Please try again.'
      }
    } else if (err instanceof Error && err.name === 'NotAllowedError') {
      registerError.value = 'Passkey creation was cancelled. Please try again.'
    } else if (err instanceof Error && err.name === 'InvalidStateError') {
      registerError.value = 'This passkey is already registered. Please try a different authenticator.'
    } else {
      registerError.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isRegistering.value = false
  }
})
</script>

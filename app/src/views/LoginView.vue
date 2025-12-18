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

          <!-- Dev-only registration link -->
          <div v-if="isDev" class="mt-4 text-center text-sm text-muted-foreground">
            Need an account?
            <router-link to="/register" class="text-primary hover:underline">
              Register
            </router-link>
          </div>
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
import { startAuthentication } from '@simplewebauthn/browser'
import type {
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticationResponseJSON
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
const route = useRoute()
const { isAuthenticated, setAuthState } = useAuth()

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}

// State
const isLoggingIn = ref(false)
const error = ref('')

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

// Form submission handler
const onSubmit = handleSubmit(async values => {
  isLoggingIn.value = true
  error.value = ''

  try {
    // Step 1: Get authentication options from backend
    const { options } = await api.post<{ options: PublicKeyCredentialRequestOptionsJSON }>(
      '/api/auth/login/options',
      { email: values.email }
    )

    // Step 2: Authenticate with passkey (browser prompts user)
    const credential: AuthenticationResponseJSON = await startAuthentication(options)

    // Step 3: Verify credential with backend
    const { token, user } = await api.post<{ token: string; user: User }>(
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
</script>

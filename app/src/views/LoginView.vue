<template>
  <AuthLayout>
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl">Admin Login</CardTitle>
        <CardDescription>Sign in with your email and password</CardDescription>
      </CardHeader>

      <CardContent>
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
                  :disabled="isLoggingIn"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="password">
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  v-bind="componentField"
                  :disabled="isLoggingIn"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <Button type="submit" class="w-full" :disabled="isLoggingIn || !meta.valid">
            {{ isLoggingIn ? 'Signing in...' : 'Sign In' }}
          </Button>
        </form>

        <!-- Dev-only registration link -->
        <div v-if="registrationOpen" class="mt-4 text-center text-sm text-muted-foreground">
          Need an account?
          <router-link to="/register" class="text-primary hover:underline"> Register </router-link>
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
import { useAuth, type User } from '@/composables/useAuth'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import AuthLayout from '@/layouts/AuthLayout.vue'

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

// Check if registration is open
const registrationOpen = ref(false)

onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/registration-status`)

    if (response.ok) {
      const { registrationOpen: isOpen } = await response.json()
      registrationOpen.value = isOpen
    }
  } catch (error) {
    // Fail closed - keep registrationOpen as false
    console.error('[LOGIN] Failed to fetch registration status:', error)
  }
})

// Form validation schema
const loginSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required')
  })
)

const { handleSubmit, meta } = useForm({
  validationSchema: loginSchema,
  initialValues: { email: '', password: '' }
})

// Form submission handler
const onSubmit = handleSubmit(async values => {
  isLoggingIn.value = true
  error.value = ''

  try {
    // Login with password
    const { token, user } = await api.post<{ token: string; user: User }>('/api/auth/login', {
      email: values.email,
      password: values.password
    })

    // Set auth state and redirect
    setAuthState(token, user)

    // Validate redirect path to prevent open redirect attacks
    const redirectQuery = route.query.redirect
    const redirect = Array.isArray(redirectQuery) ? redirectQuery[0] : redirectQuery
    const redirectPath = redirect && redirect.startsWith('/') ? redirect : '/trips'
    await router.push(redirectPath)
  } catch (err) {
    console.error('Login failed:', err)

    if (err instanceof ApiError) {
      // Note: Login returns 401 for both "user not found" and "wrong password"
      // to prevent user enumeration attacks
      if (err.status === 401) {
        error.value = 'Invalid email or password. Please try again.'
      } else {
        error.value = err.message || 'Login failed. Please try again.'
      }
    } else {
      error.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isLoggingIn.value = false
  }
})
</script>

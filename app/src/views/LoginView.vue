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
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { checkWebAuthnSupport } from '@/utils/webauthn'

const router = useRouter()
const { isAuthenticated } = useAuth()

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}

// State
const isLoggingIn = ref(false)
const error = ref('')

// Check WebAuthn support
const { supported: webAuthnSupported, message: webAuthnMessage } = checkWebAuthnSupport()

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

// Form submission handler (placeholder for Commit 3)
const onSubmit = handleSubmit(async (values) => {
  // Will be implemented in Commit 3
  console.log('Login attempt with:', values.email)
})
</script>

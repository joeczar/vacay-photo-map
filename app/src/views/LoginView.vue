<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="border-b border-border bg-card">
      <div class="max-w-7xl mx-auto flex h-16 items-center justify-between px-4">
        <router-link to="/" class="text-xl font-bold text-foreground hover:text-primary transition-colors">
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
          <CardDescription>
            Sign in to access the admin dashboard
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                     id="email"
                     type="email"
                     v-model="email"
                     placeholder="admin@example.com"
                     required
                     :disabled="isLoading" />
            </div>

            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                     id="password"
                     type="password"
                     v-model="password"
                     placeholder="Enter your password"
                     required
                     :disabled="isLoading" />
            </div>

            <Alert v-if="errorMessage" variant="destructive">
              <AlertDescription>{{ errorMessage }}</AlertDescription>
            </Alert>

            <Button
                    type="submit"
                    class="w-full"
                    :disabled="isLoading || !email || !password">
              {{ isLoading ? 'Signing in...' : 'Sign In' }}
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
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ThemeToggle from '@/components/ThemeToggle.vue'

const router = useRouter()
const { login, isAuthenticated } = useAuth()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}

async function handleSubmit() {
  if (!email.value || !password.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const { error } = await login(email.value, password.value)

    if (error) {
      errorMessage.value = error.message || 'Invalid email or password'
      return
    }

    // Successful login - redirect to admin
    router.push('/admin')
  } catch (err) {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
    console.error('Login error:', err)
  } finally {
    isLoading.value = false
  }
}
</script>

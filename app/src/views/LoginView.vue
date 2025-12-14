<!--
  TODO: Implement WebAuthn login in a future issue
  This is a stub until WebAuthn authentication is implemented.
  See implementation plan for auth milestone.
-->
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
          <CardDescription>WebAuthn authentication coming soon</CardDescription>
        </CardHeader>

        <CardContent class="text-center space-y-4">
          <p class="text-muted-foreground">
            Login functionality will be available once WebAuthn authentication is implemented.
          </p>
          <Button variant="outline" as-child>
            <router-link to="/">Return Home</router-link>
          </Button>
        </CardContent>
      </Card>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ThemeToggle from '@/components/ThemeToggle.vue'

const router = useRouter()
const { isAuthenticated } = useAuth()

// Redirect if already authenticated
if (isAuthenticated.value) {
  router.replace('/admin')
}
</script>

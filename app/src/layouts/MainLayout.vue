<template>
  <div class="min-h-screen bg-background">
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
          <Button v-if="isAuthenticated" variant="ghost" as-child>
            <router-link to="/admin">Upload</router-link>
          </Button>
          <template v-if="isAuthenticated">
            <Button variant="ghost" @click="handleLogout" :disabled="isLoading"> Logout </Button>
          </template>
          <template v-else>
            <Button variant="ghost" as-child>
              <router-link to="/login">Login</router-link>
            </Button>
          </template>
          <ThemeToggle />
        </nav>
      </div>
    </header>
    <main class="container py-8 px-4">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle.vue'

const router = useRouter()
const { isAuthenticated, isLoading, logout } = useAuth()

async function handleLogout() {
  const { error } = await logout()
  if (error) {
    console.error('Logout failed:', error)
    return
  }
  router.push('/')
}
</script>

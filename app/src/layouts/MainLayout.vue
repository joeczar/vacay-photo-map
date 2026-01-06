<template>
  <div class="min-h-screen bg-background bg-grid grain">
    <header class="border-b border-border glass-surface">
      <div class="max-w-7xl mx-auto flex h-16 items-center justify-between px-4">
        <router-link
          to="/"
          class="text-xl font-bold text-foreground hover:text-primary transition-colors"
        >
          Vacay Photo Map
        </router-link>
        <nav class="hidden md:flex items-center gap-4">
          <Button variant="ghost" as-child>
            <router-link to="/">Home</router-link>
          </Button>
          <Button v-if="isAdmin" variant="ghost" as-child>
            <router-link to="/admin">Upload</router-link>
          </Button>
          <Button v-if="isAdmin" variant="ghost" as-child>
            <router-link to="/admin/trips">Manage</router-link>
          </Button>
          <template v-if="isAuthenticated">
            <UserProfileMenu :user-email="userEmail" @logout="handleLogout" />
          </template>
          <template v-else>
            <Button variant="ghost" as-child>
              <router-link to="/login">Login</router-link>
            </Button>
          </template>
          <div class="hidden md:block">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
    <!-- Match header width on large screens for alignment -->
    <main class="max-w-7xl mx-auto w-full py-8 px-4 pb-24 md:pb-8">
      <slot />
    </main>
    <BottomNav />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle.vue'
import BottomNav from '@/components/BottomNav.vue'
import UserProfileMenu from '@/components/UserProfileMenu.vue'

const router = useRouter()
const { isAuthenticated, isAdmin, logout, user } = useAuth()

const userEmail = computed(() => user.value?.email || 'Account')

async function handleLogout() {
  try {
    await logout()
    router.push('/')
  } catch (error) {
    console.error('Logout failed:', error)
  }
}
</script>
